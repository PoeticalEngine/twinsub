// Zips the files the extension actually ships into dist/twinsub-<version>.zip for the Chrome Web Store.
// Checks first that every file the manifest names exists and every locale has the keys the manifest uses.
// Usage: node scripts/build.cjs
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const SHIP = ["manifest.json", "_locales", "icons", "popup", "src"];
const problems = [];

const named = [
  ...Object.values(manifest.icons || {}),
  manifest.action?.default_popup,
  ...(manifest.content_scripts || []).flatMap(c => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const f of named) if (!fs.existsSync(path.join(root, f))) problems.push("missing " + f);

const keys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(m => m[1]);
for (const loc of fs.readdirSync(path.join(root, "_locales"))) {
  const msgs = JSON.parse(fs.readFileSync(path.join(root, "_locales", loc, "messages.json"), "utf8"));
  for (const k of keys) if (!msgs[k]) problems.push(`${loc} lacks ${k}`);
  if ((msgs.extDescription?.message || "").length > 132) problems.push(`${loc} description over 132 characters`);
}
if (problems.length) { console.error("Not building:\n- " + problems.join("\n- ")); process.exit(1); }

const out = path.join(root, "dist", `twinsub-${manifest.version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
execFileSync("zip", ["-qrX", out, ...SHIP, "-x", "*.DS_Store", "icons/icon.svg"], { cwd: root, stdio: "inherit" });
console.log(out, Math.round(fs.statSync(out).size / 1024) + " KB");
