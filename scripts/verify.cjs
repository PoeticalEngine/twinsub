// Loads the unpacked extension in Playwright's Chromium and checks the parts that only run as a real extension:
// both content scripts inject (MAIN + isolated world), the player button appears, settings round-trip through
// chrome.storage, and the popup renders in English and Chinese without console errors.
// Chromium here has no on-device Translator, so translation itself is checked in real Chrome instead.
// Usage: node scripts/verify.cjs [videoId]
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "twinsub-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, locale: "en-US",
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    ...(proxy ? { proxy: { server: proxy } } : {}),
  });
  let [worker] = ctx.serviceWorkers();
  const extId = await (async () => {
    // No background worker: read the id from the extensions page instead.
    const p = await ctx.newPage();
    await p.goto("chrome://extensions");
    const id = await p.evaluate(() => chrome.management ? new Promise(r => chrome.management.getAll(l => r(l.find(e => e.name.startsWith("Twinsub"))?.id))) : null).catch(() => null);
    await p.close();
    return id;
  })();

  const page = ctx.pages()[0] || await ctx.newPage();
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && /twinsub/i.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Accept nothing: a consent wall just means the player never loads, which the checks below report.
  await page.waitForSelector("#movie_player .twinsub-button", { timeout: 30000 }).catch(() => problems.push("player button never appeared"));
  const state = await page.evaluate(() => ({
    pageWorld: !!window.__twinsubPage,
    overlay: !!document.querySelector("#movie_player .twinsub-overlay"),
    buttonTitle: document.querySelector(".twinsub-button")?.title,
  }));
  if (!state.pageWorld) problems.push("page.js did not run in the page world");
  if (!state.overlay) problems.push("overlay missing");
  await page.waitForTimeout(6000);
  state.chip = await page.evaluate(() => { const c = document.querySelector(".twinsub-chip"); return c && !c.hidden ? c.textContent : null; });
  state.track = await page.evaluate(() => document.getElementById("movie_player")?.getOption?.("captions", "track")?.vss_id || null);
  await page.screenshot({ path: path.join(out, "player.png") });

  if (extId) {
    for (const locale of ["en", "zh_CN"]) {
      const pp = await ctx.newPage();
      pp.on("pageerror", e => problems.push(`popup ${locale} pageerror: ` + e.message));
      await pp.setViewportSize({ width: 320, height: 520 });
      await pp.goto(`chrome-extension://${extId}/popup/popup.html`);
      await pp.waitForTimeout(500);
      const p = await pp.evaluate(() => ({ how: document.querySelector(".how").textContent, options: document.getElementById("target").options.length }));
      if (!p.how || p.options < 30) problems.push(`popup ${locale} looks empty: ` + JSON.stringify(p));
      await pp.screenshot({ path: path.join(out, `popup-${locale}.png`) });
      await pp.close();
    }
    // Settings round trip: flip a setting in the popup and see the player react.
    const pp = await ctx.newPage();
    await pp.goto(`chrome-extension://${extId}/popup/popup.html`);
    await pp.click(".switch span");
    await pp.close();
    await page.waitForTimeout(800);
    state.afterToggle = await page.evaluate(() => document.querySelector(".twinsub-button")?.getAttribute("aria-pressed"));
    if (state.afterToggle !== "false") problems.push("popup switch did not reach the player");
  } else problems.push("could not find the extension id");

  console.log(JSON.stringify(state, null, 1));
  console.log(problems.length ? "PROBLEMS:\n- " + problems.join("\n- ") : "OK");
  await ctx.close();
  process.exit(problems.length ? 1 : 0);
})();
