// Checks own-key (BYOK) explanations end to end without a real provider: a local mock speaks the three wire formats
// (Chat Completions, Responses, Claude Messages). The extension is copied with a host permission for the mock, the
// license check is answered as unlocked, and the run fails if the explain flow sends anything to api.poeticalengine.com.
// Usage: PLAYWRIGHT_DIR=... node scripts/verify-byok.cjs
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "playwright") : "playwright");

const root = path.resolve(__dirname, "..");
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const out = path.join(root, "store", "verify");
fs.mkdirSync(out, { recursive: true });
const KEY = "sk-test-0123456789abcdef";
const ANSWER = ["@@gist\n", "Mock answer from ", "FORMAT", ".\n@@background\n", "Mock background."];

// ---- mock provider ----
const seen = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const u = req.url, auth = req.headers.authorization === "Bearer " + KEY || req.headers["x-api-key"] === KEY;
    seen.push({ method: req.method, url: u, body: body ? JSON.parse(body) : null });
    if (!auth) { res.writeHead(401, { "Content-Type": "application/json" }); return res.end('{"error":{"message":"Incorrect API key provided"}}'); }
    if (req.method === "GET" && /\/models/.test(u)) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":[{"id":"mock-small"},{"id":"mock-large"}]}'); }
    const format = u.endsWith("/chat/completions") ? "chat" : u.endsWith("/responses") ? "responses" : u.endsWith("/v1/messages") ? "anthropic" : "";
    if (!format) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const parts = ANSWER.map(p => p === "FORMAT" ? format : p);
    const ev = text => format === "chat" ? `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
      : format === "responses" ? `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`
      : `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`;
    if (format === "anthropic") res.write(`event: message_start\ndata: {"type":"message_start","message":{}}\n\n`);
    let i = 0;
    const tick = setInterval(() => {
      if (i < parts.length) return res.write(ev(parts[i++]));
      clearInterval(tick);
      res.end(format === "chat" ? "data: [DONE]\n\n" : format === "responses" ? `data: {"type":"response.completed"}\n\n` : `data: {"type":"message_stop"}\n\n`);
    }, 30);
  });
});

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const mock = `http://127.0.0.1:${server.address().port}`;
  const problems = [];

  // The store build asks for host access at run time; the test copy has it for the mock up front.
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), "twinsub-ext-"));
  for (const d of ["manifest.json", "_locales", "icons", "popup", "options", "src"]) fs.cpSync(path.join(root, d), path.join(ext, d), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest));

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "twinsub-")), {
    channel: "chromium", headless: true, viewport: { width: 1400, height: 900 }, locale: "en-US",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--autoplay-policy=no-user-gesture-required"],
    ...(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1" } } : {}),
  });
  const ours = [];
  ctx.on("request", r => { if (r.url().includes("poeticalengine.com")) ours.push(r.url()); });
  await ctx.route("https://api.poeticalengine.com/**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ plan: "free", remaining: 5, limit: 5, period: "day", proReady: true, lifetimeReady: true, byok: true, lifetime: { code: "TWIN-TEST-CODE-ABCD" } }) }));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;
  await sw.evaluate(() => chrome.storage.sync.set({ target: "zh" }));

  // ---- settings page: each format tests, loads models, and saves ----
  const opt = await ctx.newPage();
  opt.on("pageerror", e => problems.push("options pageerror: " + e.message));
  await opt.goto(`chrome-extension://${id}/options/options.html`);
  await opt.waitForSelector("#license .unlocked:not([hidden])", { timeout: 10000 }).catch(() => problems.push("license not shown as unlocked"));
  const status = async () => (await opt.textContent("#status")).trim();
  for (const [provider, base] of [["custom-responses", mock + "/oa/v1"], ["custom-anthropic", mock + "/an"], ["custom-chat", mock + "/oa/v1"]]) {
    await opt.selectOption("#provider", provider);
    await opt.fill("#baseUrl", base);
    await opt.fill("#apiKey", "wrong-key");
    await opt.fill("#model", "mock-small");
    await opt.click("#test");
    await opt.waitForFunction(() => !document.getElementById("test").disabled, null, { timeout: 15000 });
    if (!/401/.test(await status())) problems.push(`${provider}: wrong key not reported: ${await status()}`);
    await opt.fill("#apiKey", KEY);
    await opt.click("#loadModels");
    await opt.waitForFunction(() => document.querySelectorAll("#models option").length === 2, null, { timeout: 10000 }).catch(async () => problems.push(`${provider}: models not loaded: ${await status()}`));
    await opt.click("#test");
    await opt.waitForFunction(() => !document.getElementById("test").disabled, null, { timeout: 15000 });
    const st = await status();
    if (!st.includes("@@gist") || await opt.$eval("#status", e => e.classList.contains("bad"))) problems.push(`${provider}: test failed: ${st}`);
  }
  // Last one stays: chat format, own key on.
  await opt.check("input[name=who][value=own]");
  await opt.click("#cfg button[type=submit]");
  await opt.waitForFunction(() => /…cdef/.test(document.getElementById("keyNote").textContent), null, { timeout: 5000 }).catch(async () => problems.push("saved key hint missing: " + await opt.textContent("#keyNote")));
  await opt.screenshot({ path: path.join(out, "byok-settings.png"), fullPage: true });

  // The key must not be readable in storage.
  const stored = await sw.evaluate(async () => JSON.stringify([await chrome.storage.local.get(null), await chrome.storage.sync.get(null)]));
  if (stored.includes("0123456789abcdef")) problems.push("API key found in plain text in chrome.storage");
  const box = JSON.parse(stored)[0].byok?.key;
  if (!box?.iv || !box?.data) problems.push("sealed key not stored: " + stored.slice(0, 300));

  // ---- popup shows own-key mode ----
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${id}/popup/popup.html`);
  await pop.waitForSelector("#byokOn:not([hidden])", { timeout: 5000 }).catch(() => problems.push("popup does not show own-key mode"));
  await pop.close();

  // ---- explain on YouTube: answer from the mock, nothing to our server ----
  const page = await ctx.newPage();
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  await page.addInitScript(() => { window.Translator = { availability: async () => "available", create: async () => ({ translate: async s => "【译】" + s }) }; });
  const fixture = path.join(root, "test", "fixtures", "en-asr.json");
  await page.route(u => u.pathname === "/api/timedtext", route => route.fulfill({ status: 200, contentType: "application/json", body: fs.readFileSync(fixture, "utf8") }));
  await page.goto("https://www.youtube.com/watch?v=arj7oStGLkU&t=60", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#movie_player video", { timeout: 30000 });
  await page.evaluate(() => { const v = document.querySelector("#movie_player video"); v.muted = true; v.play().catch(() => {}); });
  await page.waitForSelector("#movie_player .twinsub-overlay:not([hidden]) .twinsub-ask", { timeout: 45000 }).catch(() => problems.push("no subtitle line with the ? button"));
  const before = ours.length;
  const sentBefore = seen.filter(s => s.method === "POST").length;
  await page.evaluate(() => document.querySelector(".twinsub-ask").click());
  await page.waitForSelector(".twinsub-panel:not([hidden])", { timeout: 5000 }).catch(() => problems.push("panel did not open"));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector(".twinsub-panel .twinsub-btn-ghost").click());
  await page.waitForSelector(".twinsub-ans-note, .twinsub-ans-err", { timeout: 20000 }).catch(() => problems.push("no answer"));
  const answer = await page.evaluate(() => ({ text: document.querySelector(".twinsub-ans")?.innerText, foot: document.querySelector(".twinsub-panel-quota")?.textContent }));
  await page.screenshot({ path: path.join(out, "byok-answer.png") });
  if (!/Mock answer from chat/.test(answer.text || "")) problems.push("answer not from the mock: " + answer.text);
  if (!/mock-small/.test(answer.foot || "")) problems.push("footer does not show the own-key model: " + answer.foot);
  if (ours.length !== before) problems.push("explain flow reached our server: " + ours.slice(before).join(", "));
  const call = seen.filter(s => s.method === "POST").slice(sentBefore)[0];
  if (!call || call.body.model !== "mock-small" || !/Answer language: Chinese/.test(call.body.messages?.[1]?.content || "")) problems.push("provider request looks wrong: " + JSON.stringify(call?.body).slice(0, 300));

  await ctx.close();
  server.close();
  console.log(problems.length ? "PROBLEMS:\n- " + problems.join("\n- ") : `OK: three formats, models, sealed key, own-key answer, ${ours.length} requests to our server (license check only), screenshots in store/verify`);
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
