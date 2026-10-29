// Twinsub service worker: the only place that talks to api.poeticalengine.com, and only when the viewer clicks
// Explain or opens the Pro part of the menu. Answers stream back to the content script over a port as they arrive.
const API = "https://api.poeticalengine.com";

async function installId() {
  const { install } = await chrome.storage.local.get("install");
  if (install) return install;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ install: id });
  return id;
}

const post = (path, body) => fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// quota: the plan and what is left. checkout / portal: open Dodo's page in a new tab. restore: link this install to a Pro code.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = {
    quota: id => fetch(`${API}/v1/quota?install=${id}`).then(r => r.ok ? r.json() : null),
    checkout: id => post("/v1/checkout", { install: id, lang: chrome.i18n.getUILanguage() }).then(r => r.json()).then(b => {
      if (b.url) chrome.tabs.create({ url: b.url });
      return { ok: !!b.url };
    }),
    portal: id => fetch(`${API}/v1/portal?install=${id}`).then(r => r.json()).then(b => {
      if (b.url) chrome.tabs.create({ url: b.url });
      return { ok: !!b.url };
    }),
    restore: id => post("/v1/restore", { install: id, code: msg.code }).then(r => r.json()),
  }[msg?.type];
  if (!run) return;
  installId().then(run).then(reply, () => reply(null));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "twinsub-explain") return;
  const abort = new AbortController();
  port.onDisconnect.addListener(() => abort.abort());
  port.onMessage.addListener(async req => {
    const send = m => { try { port.postMessage(m); } catch {} };
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
