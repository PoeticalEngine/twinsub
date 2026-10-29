// AI settings: who writes the explanations, the Lifetime license, and the viewer's own provider and key.
// The key goes to the service worker, which encrypts it (src/vault.js); this page never gets it back, only its last 4 characters.
import { PRESETS, preset, originOf } from "../src/llm.js";

const msg = (k, ...s) => chrome.i18n.getMessage(k, s) || k;
const $ = id => document.getElementById(id);
const send = m => chrome.runtime.sendMessage(m);
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = msg(el.dataset.i18n);
document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = msg("optTitle");

for (const p of PRESETS) $("provider").append(new Option(p.name, p.id));

let saved = null;
const status = (text, bad = false) => { $("status").textContent = text; $("status").classList.toggle("bad", bad); };

function showProvider(p, keepFields) {
  $("format").disabled = !p.custom;
  $("bases").replaceChildren(...[p.base, ...(p.alt || [])].filter(Boolean).map(b => new Option(b)));
  if (!keepFields) {
    $("format").value = p.format;
    $("baseUrl").value = p.base;
    $("model").value = p.model || "";
    $("models").replaceChildren();
  }
  $("getKey").hidden = !p.keys;
  if (p.keys) $("getKey").href = p.keys;
  showKeyNote(p);
}
function showKeyNote(p = preset($("provider").value)) {
  const same = saved && saved.provider === $("provider").value;
  $("keyNote").textContent = same && saved.hasKey ? msg("optKeySaved", saved.keyHint) : p.keyless ? msg("optKeyNone") : "";
  $("removeKey").hidden = !(same && saved.hasKey);
}

function config() {
  return { enabled: document.querySelector("input[name=who]:checked")?.value === "own", provider: $("provider").value,
    format: $("format").value, baseUrl: $("baseUrl").value.trim(), model: $("model").value.trim() };
}

// Chrome asks the viewer once per provider host. Must run straight from the click, before anything is awaited.
function permit(base) {
  const origin = originOf(base);
  if (!origin) return Promise.resolve(false);
  const u = new URL(origin);
  return chrome.permissions.request({ origins: [`${u.protocol}//${u.hostname}/*`] }).catch(() => false);
}
function check(c, needModel) {
  if (!originOf(c.baseUrl)) return msg("optNeedUrl");
  if (needModel && !c.model) return msg("optNeedModel");
  return "";
}

async function load() {
  saved = await send({ type: "byok-get" });
  document.querySelector(`input[name=who][value=${saved.enabled ? "own" : "hosted"}]`).checked = true;
  $("provider").value = saved.provider;
  const p = preset(saved.provider);
  showProvider(p, true);
  $("format").value = saved.format || p.format;
  $("baseUrl").value = saved.baseUrl || p.base;
  $("model").value = saved.model || p.model || "";
  showKeyNote(p);
}

async function showLicense() {
  const q = await send({ type: "account" }).catch(() => null);
  const unlocked = q ? !!q.byok : !!saved?.unlocked;
  document.querySelector("#license .locked").hidden = unlocked;
  document.querySelector("#license .unlocked").hidden = !unlocked;
  $("buy").hidden = !q?.lifetimeReady;
  $("viaPro").hidden = !(unlocked && !q?.lifetime && q?.plan === "pro");
  $("lifeCode").hidden = !q?.lifetime;
  if (q?.lifetime) $("myCode").textContent = q.lifetime.code;
}

$("provider").addEventListener("change", () => showProvider(preset($("provider").value), false));

for (const r of document.querySelectorAll("input[name=who]")) r.addEventListener("change", async () => {
  saved = await send({ type: "byok-save", config: { ...saved, ...config() } });
  status(msg("optSaved"));
});

$("cfg").addEventListener("submit", async e => {
  e.preventDefault();
  const c = config(), problem = check(c, true);
  if (problem) return status(problem, true);
  const ok = await permit(c.baseUrl);
  if (!ok) return status(msg("optPermDenied", originOf(c.baseUrl)), true);
  saved = await send({ type: "byok-save", config: c, apiKey: $("apiKey").value.trim() });
  $("apiKey").value = "";
  showKeyNote();
  status(msg("optSaved"));
});

$("test").addEventListener("click", async () => {
  const c = config(), problem = check(c, true);
  if (problem) return status(problem, true);
  const ok = await permit(c.baseUrl);
  if (!ok) return status(msg("optPermDenied", originOf(c.baseUrl)), true);
  $("test").disabled = true;
  status(msg("optTesting"));
  const r = await send({ type: "byok-test", config: c, apiKey: $("apiKey").value.trim() }).catch(e => ({ error: e.message }));
  $("test").disabled = false;
  if (r?.ok) status(msg("optTestOk", r.sample || "…"));
  else status(msg("optTestFail", (r?.status ? r.status + " · " : "") + (r?.error || "?")), true);
});

$("loadModels").addEventListener("click", async () => {
  const c = config(), problem = check(c, false);
  if (problem) return status(problem, true);
  const ok = await permit(c.baseUrl);
  if (!ok) return status(msg("optPermDenied", originOf(c.baseUrl)), true);
  $("loadModels").disabled = true;
  const r = await send({ type: "byok-models", config: c, apiKey: $("apiKey").value.trim() }).catch(e => ({ error: e.message }));
  $("loadModels").disabled = false;
  if (!r?.ok) return status(msg("optTestFail", (r?.status ? r.status + " · " : "") + (r?.error || "?")), true);
  $("models").replaceChildren(...r.models.map(m => new Option(m)));
  status(msg("optModelsLoaded", String(r.models.length)));
  $("model").focus();
});

$("removeKey").addEventListener("click", async () => {
  saved = await send({ type: "byok-save", config: config(), clearKey: true });
  showKeyNote();
  status(msg("optKeyRemoved"));
});

$("buy").addEventListener("click", () => send({ type: "checkout", plan: "lifetime" }));
$("copy").addEventListener("click", () => navigator.clipboard.writeText($("myCode").textContent).then(() => { $("copy").textContent = msg("proCopied"); }));
$("restore").addEventListener("submit", async e => {
  e.preventDefault();
  const r = await send({ type: "restore", code: $("code").value });
  $("codeMsg").hidden = false;
  $("codeMsg").textContent = r?.ok ? msg(r.plan === "lifetime" ? "optThanks" : "proThanks") : msg(r?.error === "too many" ? "proTooMany" : "proBadCode");
  if (r?.ok) showLicense();
});

// Coming back from the checkout tab: check the license again.
document.addEventListener("visibilitychange", () => { if (!document.hidden) showLicense(); });

load().then(showLicense);
