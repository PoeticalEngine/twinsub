// Loads the unpacked extension in Playwright's Chromium, opens a YouTube video, and walks the explain flow:
// "?" button → panel → mark a phrase → Explain → answer streamed from api.poeticalengine.com.
// Each run spends one free explanation for a fresh install id (and a model call unless the answer is cached).
// Usage: PLAYWRIGHT_DIR=... node scripts/verify-explain.cjs [videoId]
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "playwright") : "playwright");

const ext = path.resolve(__dirname, "..");
const videoId = process.argv[2] || "arj7oStGLkU";
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const out = path.join(ext, "store", "verify");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const problems = [];
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "twinsub-")), {
    channel: "chromium", headless: true, viewport: { width: 1400, height: 900 }, locale: "en-US",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--autoplay-policy=no-user-gesture-required"],
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  // English captions, explanations into Chinese.
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  await sw.evaluate(() => chrome.storage.sync.set({ target: "zh" }));
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  const timedtext = [];
  // Chromium has no on-device Translator; a stand-in that tags each line lets the translation side be marked.
  await page.addInitScript(() => {
    window.Translator = {
      availability: async () => "available",
      create: async () => ({ translate: async s => "【译】" + s }),
    };
  });
  // Headless Chromium gets empty caption files from YouTube, so serve the saved ones for the test video instead.
  const fixture = path.join(ext, "test", "fixtures", "en-asr.json");
  if (videoId === "arj7oStGLkU" && fs.existsSync(fixture))
    await page.route(u => u.pathname === "/api/timedtext", route => route.fulfill({ status: 200, contentType: "application/json", body: fs.readFileSync(fixture, "utf8") }));
  page.on("response", r => { if (r.url().includes("/api/timedtext")) timedtext.push(r.status() + " " + new URL(r.url()).searchParams.get("lang") + " " + (r.headers()["content-length"] || "?")); });
  await page.goto(`https://www.youtube.com/watch?v=${videoId}&t=60`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#movie_player video", { timeout: 30000 });
  await page.evaluate(() => { const v = document.querySelector("#movie_player video"); v.muted = true; v.play().catch(() => {}); });
  await page.waitForSelector("#movie_player .twinsub-overlay:not([hidden]) .twinsub-ask", { timeout: 45000 }).catch(() => problems.push("no subtitle line with the ? button"));
  await page.screenshot({ path: path.join(out, "explain-1-button.png") });
  if (problems.length) {
    console.log(await page.evaluate(() => ({ track: document.getElementById("movie_player")?.getOption?.("captions", "track"), overlay: document.querySelector(".twinsub-overlay")?.outerHTML?.slice(0, 300), chip: document.querySelector(".twinsub-chip")?.textContent, t: document.querySelector("#movie_player video")?.currentTime })), timedtext);
    console.log("PROBLEMS:\n- " + problems.join("\n- ")); await ctx.close(); process.exit(1);
  }
  await page.evaluate(() => document.querySelector(".twinsub-ask").click());
  await page.waitForSelector(".twinsub-panel:not([hidden])", { timeout: 5000 }).catch(() => problems.push("panel did not open"));
  const paused = await page.evaluate(() => document.querySelector("#movie_player video").paused);
  if (!paused) problems.push("video kept playing");
  const hint = await page.evaluate(() => document.querySelector(".twinsub-panel-hint").textContent);
  if (!/译文/.test(hint)) problems.push("hint does not say to mark the translation: " + hint);
  // Mark the longest word of the current line's translation; the original underneath can't be marked.
  const marked = await page.evaluate(() => {
    const o = document.querySelector(".twinsub-pl-cur .twinsub-pl-main");
    if (!o.textContent.startsWith("【译】")) return "NOT-TRANSLATION:" + o.textContent;
    const node = o.firstChild, text = node.textContent;
    const word = text.split(/\s+/).sort((a, b) => b.length - a.length)[0].replace(/[^\p{L}\p{N}'-]/gu, "");
    const at = text.indexOf(word);
    const r = document.createRange(); r.setStart(node, at); r.setEnd(node, at + word.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    o.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return word;
  });
  const markOk = await page.evaluate(w => document.querySelector(".twinsub-mark-on")?.textContent === w, marked);
  if (!markOk) problems.push("mark not created for " + marked);
  await page.screenshot({ path: path.join(out, "explain-2-marked.png") });
  await page.evaluate(() => document.querySelector(".twinsub-explain-btn").click());
  const t0 = Date.now();
  await page.waitForSelector(".twinsub-ans-note, .twinsub-ans-err, .twinsub-ans-quota", { timeout: 60000 }).catch(() => problems.push("no answer within 60 s"));
  const answer = await page.evaluate(() => ({ text: document.querySelector(".twinsub-ans")?.innerText, foot: document.querySelector(".twinsub-panel-quota")?.textContent }));
  await page.screenshot({ path: path.join(out, "explain-3-answer.png") });
  if (!answer.text || /没能|Couldn't/.test(answer.text)) problems.push("bad answer: " + answer.text);
  await page.evaluate(() => document.querySelector(".twinsub-panel-close").click());
  await page.waitForTimeout(800);
  const resumed = await page.evaluate(() => !document.querySelector("#movie_player video").paused);
  if (!resumed) problems.push("video did not resume after closing");
  console.log(JSON.stringify({ marked, ms: Date.now() - t0, answer }, null, 1));
  console.log(problems.length ? "PROBLEMS:\n- " + problems.join("\n- ") : "OK");
  await ctx.close();
  process.exit(problems.length ? 1 : 0);
})();
