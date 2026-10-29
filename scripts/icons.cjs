// Renders icons/icon.svg to the PNG sizes the manifest and the store need.
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "playwright") : "playwright");
const fs = require("fs");
const dir = path.join(__dirname, "..", "icons");
const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
(async () => {
  const b = await chromium.launch();
  for (const size of [16, 32, 48, 128]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    // The store wants 96x96 artwork inside the 128 icon's transparent padding.
    const art = size === 128 ? 96 : size, pad = (size - art) / 2;
    await p.setContent(`<html><body style="margin:0;padding:${pad}px;background:transparent">${svg.replace("<svg", `<svg width="${art}" height="${art}" style="display:block"`)}</body></html>`);
    await p.screenshot({ path: path.join(dir, `${size}.png`), omitBackground: true });
    await p.close();
  }
  await b.close();
})();
