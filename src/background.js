// Twinsub service worker. Explanations go one of two ways:
// - through api.poeticalengine.com (the free daily quota and Pro), only when the viewer clicks Explain;
// - with the viewer's own API key (Lifetime, or included with Pro): straight from here to their provider. That path never
//   touches our server, not even for a quota check; the key is decrypted here and nowhere else (see vault.js).
// Answers stream back to the content script over a port as they arrive.
import { SYSTEM, buildRequest } from "./prompt.js";
import { preset, stream, listModels, ProviderError } from "./llm.js";
import { seal, open } from "./vault.js";

const API = "https://api.poeticalengine.com";

async function installId() {
  const { install } = await chrome.storage.local.get("install");
  if (install) return install;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ install: id });
  return id;
}

const post = (path, body) => fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Own-key settings, in chrome.storage.local only (never sync): { enabled, provider, format, baseUrl, model, key, keyHint },
// where key is the sealed API key. "unlock" caches whether this install may use them, as the server last said.
async function byokState() {
  const { byok = {}, unlock = {} } = await chrome.storage.local.get(["byok", "unlock"]);
  return { byok, unlocked: !!unlock.byok };
}
const active = ({ byok, unlocked }) => unlocked && byok.enabled && byok.baseUrl && byok.model;
const publicConfig = ({ byok, unlocked }) => ({
  enabled: !!byok.enabled, provider: byok.provider || "openai", format: byok.format || "", baseUrl: byok.baseUrl || "",
  model: byok.model || "", hasKey: !!byok.key, keyHint: byok.keyHint || "", unlocked,
});

// The settings page may pass a key it has not saved yet (to test it or list models); otherwise the stored one is used.
async function withKey(cfg, typed) {
  const { byok } = await byokState();
  const apiKey = typed || (byok.key ? await open(byok.key) : "");
  return { format: cfg.format, baseUrl: cfg.baseUrl, model: cfg.model, apiKey };
}

async function account(id) {
  const q = await fetch(`${API}/v1/quota?install=${id}`).then(r => r.ok ? r.json() : null);
  if (q) await chrome.storage.local.set({ unlock: { byok: !!q.byok, at: Date.now() } });
  return q;
}

const fromExtensionPage = sender => sender.id === chrome.runtime.id && String(sender.url || "").startsWith(chrome.runtime.getURL(""));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const run = {
    // quota: what the explain panel shows. With an own key it is answered here, without asking our server.
    quota: async id => {
      const s = await byokState();
      if (active(s)) return { plan: "byok", provider: s.byok.model };
      return fetch(`${API}/v1/quota?install=${id}`).then(r => r.ok ? r.json() : null);
    },
    // account: the menu and settings page; also refreshes whether own-key explanations are unlocked.
    account,
    checkout: id => post("/v1/checkout", { install: id, lang: chrome.i18n.getUILanguage(), plan: msg.plan }).then(r => r.json()).then(b => {
      if (b.url) chrome.tabs.create({ url: b.url });
      return { ok: !!b.url };
    }),
    portal: id => fetch(`${API}/v1/portal?install=${id}`).then(r => r.json()).then(b => {
      if (b.url) chrome.tabs.create({ url: b.url });
      return { ok: !!b.url };
    }),
    restore: id => post("/v1/restore", { install: id, code: msg.code }).then(r => r.json()).then(async r => { if (r?.ok) await account(id); return r; }),
    settings: () => chrome.runtime.openOptionsPage().then(() => ({ ok: true })),
  }[msg?.type];
  // Own-key settings are only for the extension's own pages, never content scripts.
  const own = fromExtensionPage(sender) && {
    "byok-get": async () => publicConfig(await byokState()),
    "byok-save": async () => {
      const { byok } = await byokState();
      const c = msg.config || {}, next = { ...byok, enabled: !!c.enabled, provider: c.provider, format: c.format, baseUrl: String(c.baseUrl || "").trim(), model: String(c.model || "").trim() };
      if (msg.clearKey) { delete next.key; delete next.keyHint; }
      else if (msg.apiKey) { next.key = await seal(msg.apiKey.trim()); next.keyHint = "…" + msg.apiKey.trim().slice(-4); }
      await chrome.storage.local.set({ byok: next });
      return publicConfig(await byokState());
    },
    "byok-test": async () => {
      const cfg = await withKey(msg.config || {}, msg.apiKey);
      const abort = new AbortController();
      let text = "";
      for await (const t of stream(cfg, "Reply with the single word OK.", "Say OK.", AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]))) {
        text += t;
        if (text.length > 40) { abort.abort(); break; }
      }
      return { ok: true, sample: text.trim().slice(0, 40) };
    },
    "byok-models": async () => ({ ok: true, models: await listModels(await withKey(msg.config || {}, msg.apiKey), AbortSignal.timeout(20000)) }),
  }[msg?.type];
  const job = own ? own() : run ? installId().then(run) : null;
  if (!job) return;
  job.then(reply, e => reply(e instanceof ProviderError || own ? { ok: false, status: e.status || 0, error: String(e.message || e).slice(0, 300) } : null));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "twinsub-explain") return;
  const abort = new AbortController();
  port.onDisconnect.addListener(() => abort.abort());
  port.onMessage.addListener(async req => {
    const send = m => { try { port.postMessage(m); } catch {} };
    const s = await byokState();
    if (s.byok.enabled) return explainOwn(req, s, send, abort.signal);
    try {
      const res = await fetch(`${API}/v1/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, install: await installId() }),
        signal: abort.signal,
      });
      const remaining = res.headers.get("X-Twinsub-Remaining"), limit = res.headers.get("X-Twinsub-Limit");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        send({ type: "error", status: res.status, error: body.error, limit: body.limit, plan: body.plan });
        return;
      }
      send({ type: "head", remaining: remaining === null ? null : Number(remaining), limit: limit === null ? null : Number(limit) });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        send({ type: "chunk", text: dec.decode(value, { stream: true }) });
      }
      send({ type: "done" });
    } catch (e) {
      if (!abort.signal.aborted) send({ type: "error", status: 0, error: "network" });
    }
  });
});

// Own key turned on: the same prompt as the server's, sent straight to the viewer's provider. If own keys are on but
// not unlocked or not set up, this says so rather than quietly sending the request to our server instead.
async function explainOwn(req, s, send, signal) {
  if (!s.unlocked) return send({ type: "error", status: 0, error: "byok-locked" });
  if (!active(s)) return send({ type: "error", status: 0, error: "byok-setup" });
  const built = buildRequest(req);
  if (built.error) return send({ type: "error", status: 400, error: built.error });
  const name = preset(s.byok.provider).name;
  try {
    const apiKey = s.byok.key ? await open(s.byok.key) : "";
    send({ type: "head", remaining: null, limit: null });
    for await (const text of stream({ ...s.byok, apiKey }, SYSTEM, built.user, signal)) send({ type: "chunk", text });
    send({ type: "done" });
  } catch (e) {
    if (signal.aborted) return;
    send({ type: "error", status: e.status || 0, error: "byok", provider: name, detail: String(e.message || e).slice(0, 200) });
  }
}
