// Twinsub API: explains a subtitle line the viewer didn't understand, streamed as plain text.
// POST /v1/explain  -> text stream of "@@section" blocks (see prompt.js), X-Twinsub-Remaining header
// GET  /v1/quota?install=<id> -> { remaining, limit }
// Free use is counted per install id and per IP each UTC day in D1, with a global daily cap as a cost brake.
// Answers are cached by video + line + marked text, and a cached answer costs the viewer nothing.
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM, buildRequest } from "./prompt.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Twinsub-Remaining, X-Twinsub-Limit",
};
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });

const today = () => new Date().toISOString().slice(0, 10);
const validInstall = id => typeof id === "string" && /^[A-Za-z0-9-]{16,64}$/.test(id);

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function counts(db, day, keys) {
  const { results } = await db.prepare(`SELECT k, n FROM usage WHERE day = ? AND k IN (${keys.map(() => "?").join(",")})`).bind(day, ...keys).all();
  return Object.fromEntries(keys.map(k => [k, results.find(r => r.k === k)?.n || 0]));
}
const bump = (db, day, k, by = 1) =>
  db.prepare("INSERT INTO usage (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = n + excluded.n").bind(day, k, by);

// Fallbacks are offered on the models that accept the "default" form.
const takesFallbacks = model => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

async function explain(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!validInstall(body?.install)) return json({ error: "bad install id" }, 400);
  const built = buildRequest(body);
  if (built.error) return json({ error: built.error }, 400);

  const limit = Number(env.FREE_PER_DAY) || 5;
  const day = today();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const installKey = "i:" + body.install, ipKey = "ip:" + ip;
  const key = await sha256(built.cacheKey);
  const used = await counts(env.DB, day, [installKey, ipKey, "all"]);
  const remainingBefore = Math.max(0, limit - used[installKey]);

  const cached = await env.DB.prepare("SELECT text FROM explanations WHERE key = ?").bind(key).first();
  if (cached) {
    return new Response(cached.text, { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS, "X-Twinsub-Remaining": String(remainingBefore), "X-Twinsub-Limit": String(limit), "X-Twinsub-Cache": "hit" } });
  }
  if (used[installKey] >= limit || used[ipKey] >= limit * (Number(env.INSTALLS_PER_IP) || 4)) {
    return json({ error: "quota", remaining: 0, limit }, 429);
  }
  if (used.all >= (Number(env.GLOBAL_PER_DAY) || 3000)) return json({ error: "busy" }, 503);

  const model = env.MODEL || "claude-haiku-5-5";
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const params = {
    model,
    max_tokens: 4000,
    output_config: { effort: env.EFFORT || "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: built.user }],
  };
  if (takesFallbacks(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  ctx.waitUntil((async () => {
    let text = "", counted = false;
    try {
      const stream = client.beta.messages.stream(params);
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (!counted) {
            // Charged once the answer starts, so a failed call costs the viewer nothing.
            counted = true;
            await env.DB.batch([bump(env.DB, day, installKey), bump(env.DB, day, ipKey), bump(env.DB, day, "all")]);
          }
          text += event.delta.text;
          await writer.write(enc.encode(event.delta.text));
        }
      }
      const final = await stream.finalMessage();
      await env.DB.batch([bump(env.DB, day, "tok_in:" + model, final.usage.input_tokens || 0), bump(env.DB, day, "tok_out:" + model, final.usage.output_tokens || 0)]);
      if (final.stop_reason === "refusal") await writer.write(enc.encode("\n@@error\nrefused"));
      else if (text.trim()) await env.DB.prepare("INSERT OR REPLACE INTO explanations (key, text, model, created_at) VALUES (?, ?, ?, ?)").bind(key, text, model, Date.now()).run();
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) console.error("explain rate limited", e.message);
      else if (e instanceof Anthropic.APIError) console.error("explain api error", e.status, e.message);
      else console.error("explain failed", e?.message || e);
      await writer.write(enc.encode("\n@@error\nfailed")).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })());
  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...CORS, "X-Twinsub-Remaining": String(Math.max(0, remainingBefore - 1)), "X-Twinsub-Limit": String(limit) },
  });
}

async function quota(url, env) {
  const install = url.searchParams.get("install");
  if (!validInstall(install)) return json({ error: "bad install id" }, 400);
  const limit = Number(env.FREE_PER_DAY) || 5;
  const used = await counts(env.DB, today(), ["i:" + install]);
  return json({ remaining: Math.max(0, limit - used["i:" + install]), limit });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/v1/explain" && request.method === "POST") return explain(request, env, ctx);
    if (url.pathname === "/v1/quota" && request.method === "GET") return quota(url, env);
    if (url.pathname === "/") return new Response("Twinsub API\n", { headers: { "Content-Type": "text/plain" } });
    return json({ error: "not found" }, 404);
  },
};
