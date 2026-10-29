// Settings live in chrome.storage.sync; the content script on YouTube picks up changes as they happen.
const DEFAULTS = { enabled: true, target: "auto", order: "original-first", showOriginal: true, showTranslation: true, size: 1, bottom: 10 };
const msg = (k, ...s) => chrome.i18n.getMessage(k, s) || k;
const names = new Intl.DisplayNames([chrome.i18n.getUILanguage()], { type: "language" });
const name = code => { try { return names.of(code); } catch { return code; } };

for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = msg(el.dataset.i18n);
document.documentElement.lang = chrome.i18n.getUILanguage();

const target = document.getElementById("target");
const auto = TwinsubCaptions.translatorLang(navigator.language) || "en";
target.append(new Option(msg("popupTargetAuto", name(auto)), "auto"));
TwinsubCaptions.SUPPORTED.map(c => [name(c), c]).sort((a, b) => a[0].localeCompare(b[0])).forEach(([n, c]) => target.append(new Option(n, c)));

chrome.storage.sync.get(DEFAULTS).then(s => {
  for (const k of ["enabled", "showOriginal", "showTranslation"]) document.getElementById(k).checked = s[k];
  for (const k of ["target", "size", "bottom"]) document.getElementById(k).value = s[k];
  document.querySelector(`input[name=order][value="${s.order}"]`).checked = true;
});

const save = v => chrome.storage.sync.set(v);
for (const k of ["enabled", "showOriginal", "showTranslation"]) document.getElementById(k).addEventListener("change", e => save({ [k]: e.target.checked }));
target.addEventListener("change", () => save({ target: target.value }));
for (const k of ["size", "bottom"]) document.getElementById(k).addEventListener("input", e => save({ [k]: Number(e.target.value) }));
for (const r of document.querySelectorAll("input[name=order]")) r.addEventListener("change", () => save({ order: r.value }));

// Twinsub Pro: shown once the server can sell it, or when this computer already has it.
const pro = document.getElementById("pro");
const $ = id => document.getElementById(id);
function showPro(q) {
  if (!q || (q.plan !== "pro" && !q.proReady)) return;
  pro.hidden = false;
  const on = q.plan === "pro";
  pro.querySelector(".pro-free").hidden = on;
  pro.querySelector(".pro-on").hidden = !on;
  if (!on) return;
  $("proLeft").textContent = msg("proActive", String(q.remaining));
  $("myCode").textContent = q.code;
  if (!q.renews && q.until) { $("proEnds").hidden = false; $("proEnds").textContent = msg("proEnds", new Date(q.until).toLocaleDateString()); }
}
const refresh = () => chrome.runtime.sendMessage({ type: "quota" }).then(showPro, () => {});
refresh();
$("upgrade").addEventListener("click", () => chrome.runtime.sendMessage({ type: "checkout" }).then(r => { if (r?.ok) window.close(); }));
$("manage").addEventListener("click", e => { e.preventDefault(); chrome.runtime.sendMessage({ type: "portal" }); });
$("copy").addEventListener("click", () => navigator.clipboard.writeText($("myCode").textContent).then(() => { $("copy").textContent = msg("proCopied"); }));
$("restore").addEventListener("submit", e => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: "restore", code: $("code").value }).then(r => {
    const m = $("codeMsg");
    m.hidden = false;
    m.textContent = r?.ok ? msg("proThanks") : msg(r?.error === "too many" ? "proTooMany" : "proBadCode");
    if (r?.ok) refresh();
  });
});
