// Writes _locales/<locale>/messages.json from store/copy/<locale>.json, the one place every translated string
// lives (extension UI, store copy and screenshot text).
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "store/copy");
const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")).messages);
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
  const locale = f.replace(".json", "");
  const { messages } = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const missing = keys.filter(k => !messages[k]);
  if (missing.length) throw new Error(`${locale} is missing ${missing.join(", ")}`);
  if (messages.extDescription.length > 132) throw new Error(`${locale} description is ${messages.extDescription.length} chars`);
  if (messages.extName.length > 75) throw new Error(`${locale} name is too long`);
  for (const k of keys) {
    // "$$" is a literal dollar sign in chrome.i18n, not a placeholder.
    const holes = m => (m.replace(/\$\$/g, "").match(/\$\d/g) || []).sort().join();
    const want = holes(messages[k]);
    const en = holes(JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")).messages[k]);
    if (want !== en) throw new Error(`${locale}.${k} placeholders ${want} differ from en ${en}`);
  }
  fs.mkdirSync(path.join(root, "_locales", locale), { recursive: true });
  fs.writeFileSync(path.join(root, "_locales", locale, "messages.json"),
    JSON.stringify(Object.fromEntries(keys.map(k => [k, { message: messages[k] }])), null, 1) + "\n");
  console.log(locale, messages.extName);
}
