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
