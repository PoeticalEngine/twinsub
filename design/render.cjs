// Renders each frame of explain-mockup.html to design/explain-<n>.png. Needs PLAYWRIGHT_DIR like the store scripts.
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "playwright") : "playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 800 }, deviceScaleFactor: 1 });
  await p.goto("file://" + path.join(__dirname, "explain-mockup.html"));
  for (const n of [1, 2, 3, 4]) await p.locator(`#f${n}`).screenshot({ path: path.join(__dirname, `explain-${n}.png`) });
  await b.close();
})();
