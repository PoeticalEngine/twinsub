// Twinsub Pro: a monthly Dodo Payments subscription with no account. The checkout carries the install id and a fresh Pro code in
// its metadata; the subscription webhook stores the code and links that install. The code can be entered on other computers.
// Webhooks are business-wide (Grassy Knees events arrive here too), so anything without our product or app tag is ignored.

const mode = env => env.DODO_MODE === "live" ? "live" : "test";
const apiBase = env => mode(env) === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const apiKey = env => mode(env) === "live" ? env.DODO_LIVE_API_KEY : env.DODO_API_KEY;
const webhookSecret = env => mode(env) === "live" ? env.DODO_LIVE_WEBHOOK_SECRET : env.DODO_WEBHOOK_SECRET;
const product = env => mode(env) === "live" ? env.DODO_PRODUCT_LIVE : env.DODO_PRODUCT_TEST;
export const proReady = env => !!(apiKey(env) && product(env));
export const proLimit = env => Number(env.PRO_PER_MONTH) || 1000;
export const month = () => "m" + new Date().toISOString().slice(0, 7);

// Codes look like TWIN-7K3P-QX9M: no 0/O/1/I, so they survive being read aloud or retyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = [...b].map(x => ALPHABET[x % ALPHABET.length]).join("");
  return `TWIN-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export function normalizeCode(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^TWIN/, "");
  return s.length === 12 && [...s].every(c => ALPHABET.includes(c)) ? `TWIN-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null;
}

// Active and past-due (Dodo is retrying the card) count as Pro; a cancelled subscription keeps Pro until the paid period ends.
export function isPro(row, now = Date.now()) {
  if (!row) return false;
  if (row.status === "active" || row.status === "past_due") return true;
  return row.status === "cancelled" && !!row.period_end && Date.parse(row.period_end) > now;
}

// Only subscriptions from the mode the server runs in count: a test-mode subscription never gets live renewal events.
export async function proFor(env, install) {
  const row = await env.DB.prepare("SELECT s.* FROM installs i JOIN subs s ON s.code = i.code WHERE i.install = ? AND s.mode = ?").bind(install, mode(env)).first();
  return isPro(row) ? row : null;
}

export async function checkout(env, install, lang) {
  if (!proReady(env)) return { error: "unavailable", status: 503 };
  const site = env.SITE || "https://twinsub.poeticalengine.com";
  const l = String(lang || "").replace("_", "-").toLowerCase();
  const dir = /^zh-(tw|hk|mo|hant)/.test(l) ? "zh-tw/" : { en: "", zh: "zh/", ja: "ja/", ko: "ko/", fr: "fr/", de: "de/", es: "es/", hi: "hi/", id: "id/" }[l.slice(0, 2)] ?? "";
  const res = await fetch(apiBase(env) + "/checkouts", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      product_cart: [{ product_id: product(env), quantity: 1 }],
      metadata: { app: "twinsub", install, code: newCode() },
      return_url: `${site}/${dir}pro/`,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const body = res?.ok ? await res.json().catch(() => null) : null;
  if (!body?.checkout_url) {
    console.error("checkout failed", res?.status ?? 0, res && !res.ok ? (await res.text().catch(() => "")).slice(0, 200) : "");
    return { error: "unavailable", status: 503 };
  }
  return { url: body.checkout_url };
}

export async function portal(env, row) {
  if (!row?.customer_id || !apiKey(env)) return null;
  const site = env.SITE || "https://twinsub.poeticalengine.com";
  const res = await fetch(`${apiBase(env)}/customers/${encodeURIComponent(row.customer_id)}/customer-portal/session?return_url=${encodeURIComponent(site + "/")}`, {
    method: "POST", headers: { Authorization: "Bearer " + apiKey(env) }, signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const body = res?.ok ? await res.json().catch(() => null) : null;
  return body?.link || null;
}

// A code may be used on up to 5 computers; entering it again on one already linked is fine.
export const MAX_INSTALLS = 5;
export async function restore(env, install, rawCode) {
  const db = env.DB;
  const code = normalizeCode(rawCode);
  if (!code) return { error: "bad code", status: 400 };
  const row = await env.DB.prepare("SELECT * FROM subs WHERE code = ? AND mode = ?").bind(code, mode(env)).first();
  if (!isPro(row)) return { error: "bad code", status: 404 };
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM installs WHERE code = ? AND install != ?").bind(code, install).first();
  if (n >= MAX_INSTALLS) return { error: "too many", status: 409 };
  await db.prepare("INSERT INTO installs (install, code, linked_at) VALUES (?, ?, ?) ON CONFLICT (install) DO UPDATE SET code = excluded.code, linked_at = excluded.linked_at").bind(install, code, Date.now()).run();
  return { ok: true };
}

// ---- webhook (Standard Webhooks: HMAC-SHA256 over "id.timestamp.body", base64, key = the whsec_ secret base64-decoded) ----
export async function verify(env, body, id, timestamp, signature, now = Date.now()) {
  const secret = webhookSecret(env);
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  let raw;
  try { raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), c => c.charCodeAt(0)); } catch { return false; }
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return signature.split(" ").some(part => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig || sig.length !== expected.length) return false;
    let d = 0;
    for (let i = 0; i < sig.length; i++) d |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return d === 0;
  });
}

export async function handle(env, event) {
  if (!String(event?.type || "").startsWith("subscription.")) return "ignored";
  const d = event.data || {}, meta = d.metadata || {};
  const ours = [env.DODO_PRODUCT_TEST, env.DODO_PRODUCT_LIVE].filter(Boolean);
  if (meta.app !== "twinsub" || !ours.includes(d.product_id) || !d.subscription_id) return "ignored";
  const db = env.DB;
  // The code from checkout metadata is the subscription's for good; later events find it by subscription id.
  const existing = await db.prepare("SELECT code FROM subs WHERE subscription_id = ?").bind(d.subscription_id).first();
  const code = existing?.code || normalizeCode(meta.code);
  if (!code) return "ignored";
  await db.prepare(`INSERT INTO subs (code, subscription_id, customer_id, email, status, period_end, cancel_at_end, mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (code) DO UPDATE SET customer_id = excluded.customer_id, email = excluded.email, status = excluded.status,
        period_end = excluded.period_end, cancel_at_end = excluded.cancel_at_end, updated_at = excluded.updated_at`)
    .bind(code, d.subscription_id, d.customer?.customer_id || null, d.customer?.email || null, String(d.status || "pending"),
      d.next_billing_date || null, d.cancel_at_next_billing_date ? 1 : 0, mode(env), Date.now()).run();
  if (!existing && /^[A-Za-z0-9-]{16,64}$/.test(meta.install || "")) {
    await db.prepare("INSERT INTO installs (install, code, linked_at) VALUES (?, ?, ?) ON CONFLICT (install) DO UPDATE SET code = excluded.code, linked_at = excluded.linked_at").bind(meta.install, code, Date.now()).run();
  }
  console.log(JSON.stringify({ pro: event.type, status: d.status, mode: mode(env) }));
  return "stored";
}
