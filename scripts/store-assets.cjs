// Renders the Chrome Web Store images from HTML: five 1280x800 screenshots per locale, a 440x280 small promo
// tile and a 1400x560 marquee. The video frames are drawn scenes, not real YouTube footage, and the settings
// panel is the real popup rendered with a chrome.* stub.
// Usage: node scripts/store-assets.cjs [locale ...]
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, "playwright") : "playwright");

const root = path.resolve(__dirname, "..");
const icon = fs.readFileSync(path.join(root, "icons/icon.svg"), "utf8");

// Every locale's text lives in store/copy/<locale>.json (see scripts/locales.cjs).
const COPY = Object.fromEntries(fs.readdirSync(path.join(root, "store/copy")).filter(f => f.endsWith(".json")).sort()
  .map(f => [f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(root, "store/copy", f), "utf8"))])
  .filter(([locale]) => !process.argv[2] || process.argv.slice(2).includes(locale)));

// Seeded random so the drawn scenes are identical on every run.
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function scene(name) {
  const r = rng({ city: 7, sunset: 11, studio: 23, forest: 31, night: 43 }[name] || 5);
  const bokeh = (n, colors, min, max, alpha) => Array.from({ length: n }, () => {
    const s = min + r() * (max - min), c = colors[Math.floor(r() * colors.length)];
    return `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 75).toFixed(1)}%;width:${s}px;height:${s}px;background:radial-gradient(circle, ${c} 0%, transparent 70%);opacity:${(alpha * (0.5 + r() / 2)).toFixed(2)}"></i>`;
  }).join("");
  switch (name) {
    case "city": return { bg: "linear-gradient(180deg,#141a3a 0%,#2a1f4f 55%,#3b2140 100%)", layer: bokeh(46, ["#ffb347", "#ff6f91", "#ffd36e", "#7fd3ff"], 30, 150, 0.85) };
    case "sunset": return { bg: "linear-gradient(180deg,#ff9a62 0%,#ff6f7d 40%,#6d3f7a 75%,#2b2347 100%)", layer: `<b style="left:58%;top:30%;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,#fff3c4,#ffd27a 55%,transparent 72%)"></b><b style="left:0;right:0;top:62%;height:38%;background:linear-gradient(180deg,#2e2550,#1a1734)"></b>` + bokeh(14, ["#ffe2a8", "#ffb3a0"], 20, 60, 0.5) };
    case "studio": return { bg: "radial-gradient(ellipse at 50% 20%,#7a4a2a 0%,#3a2318 45%,#160e0b 100%)", layer: `<b style="left:38%;top:-10%;width:340px;height:120%;background:linear-gradient(180deg,rgba(255,230,180,.35),transparent 80%);transform:skewX(-8deg)"></b>` + bokeh(22, ["#ffcf8a", "#ff9d5c"], 20, 90, 0.6) };
    case "forest": return { bg: "linear-gradient(180deg,#a8d8a0 0%,#4f8f5f 45%,#1f4a34 100%)", layer: bokeh(36, ["#f3ffd1", "#c8f2a6", "#ffffff"], 16, 80, 0.55) };
    default: return { bg: "linear-gradient(180deg,#0b1424 0%,#13233f 60%,#1d1b33 100%)", layer: bokeh(60, ["#9ec9ff", "#ffffff", "#ffd36e"], 6, 40, 0.8) };
  }
}

function player(s, w, { orig, trans, transFirst = false } = {}) {
  const sc = scene(s);
  const lines = [`<div class="cap o">${orig}</div>`, `<div class="cap t">${trans}</div>`];
  if (transFirst) lines.reverse();
  return `<div class="player" style="width:${w}px;height:${Math.round(w * 9 / 16)}px;--w:${w}">
    <div class="scene" style="background:${sc.bg}">${sc.layer}</div>
    <div class="shade"></div>
    <div class="subs">${lines.join("")}</div>
    <div class="bar"><div class="prog"><span></span></div>
      <div class="ctl"><span class="play"></span><span class="time">4:12 / 18:40</span><span class="sp"></span>
        <span class="tw">${icon}</span><span class="cc">CC</span><span class="gear"></span></div></div>
  </div>`;
}

const CSS = font => `
*{box-sizing:border-box;margin:0}
body{font-family:${font};-webkit-font-smoothing:antialiased;color:#fff;overflow:hidden}
.frame{position:relative;width:1280px;height:800px;background:radial-gradient(ellipse at 20% 0%,#2a2540 0%,#121217 55%,#0b0b0e 100%);padding:56px 64px;display:flex;flex-direction:column}
.eyebrow{display:inline-flex;align-items:center;gap:10px;color:#ffe27a;font-weight:700;font-size:20px;letter-spacing:.02em}
.eyebrow svg{width:30px;height:30px}
h1{font-size:60px;line-height:1.08;font-weight:800;letter-spacing:-.02em;margin-top:14px}
p.sub{font-size:24px;line-height:1.4;color:#c9c9d3;margin-top:14px;max-width:820px}
.player{position:relative;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}
.scene{position:absolute;inset:0}
.scene i,.scene b{position:absolute;border-radius:50%;display:block}
.scene b{border-radius:0}
.scene b:first-child{border-radius:50%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.55) 100%)}
.subs{position:absolute;left:50%;bottom:calc(var(--w) * 0.105px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:calc(var(--w) * .006px);width:92%}
.cap{background:rgba(8,8,8,.74);padding:calc(var(--w) * .005px) calc(var(--w) * .014px);border-radius:calc(var(--w) * .007px);font-size:calc(var(--w) * .031px);line-height:1.35;text-align:center;font-family:${font}}
.cap.t{color:#ffe27a;font-size:calc(var(--w) * .029px)}
.bar{position:absolute;left:0;right:0;bottom:0;padding:0 calc(var(--w) * .016px) calc(var(--w) * .01px)}
.prog{height:calc(var(--w) * .004px);background:rgba(255,255,255,.3);border-radius:3px;margin-bottom:calc(var(--w) * .01px)}
.prog span{display:block;width:23%;height:100%;background:#ffe27a;border-radius:3px}
.ctl{display:flex;align-items:center;gap:calc(var(--w) * .018px);height:calc(var(--w) * .03px);font-size:calc(var(--w) * .015px);color:#eee}
.play{width:0;height:0;border-left:calc(var(--w) * .016px) solid #fff;border-top:calc(var(--w) * .01px) solid transparent;border-bottom:calc(var(--w) * .01px) solid transparent}
.sp{flex:1}
.tw svg{width:calc(var(--w) * .03px);height:calc(var(--w) * .03px);display:block;border-radius:6px;box-shadow:0 0 0 2px #ffe27a}
.cc{font-weight:700;border:2px solid #eee;border-radius:4px;padding:0 4px;font-size:calc(var(--w) * .011px)}
.gear{width:calc(var(--w) * .017px);height:calc(var(--w) * .017px);border:3px solid #eee;border-radius:50%}
.chips{display:flex;gap:12px;margin-top:22px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:rgba(255,226,122,.12);border:1px solid rgba(255,226,122,.35);color:#ffe9a6;font-size:19px;font-weight:600}
.chip::before{content:"✓";color:#ffe27a;font-weight:800}
.row{display:flex;gap:40px;align-items:center;margin-top:30px}
.call{display:flex;flex-direction:column;gap:18px}
.call div{font-size:26px;font-weight:700;padding:16px 24px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);white-space:nowrap}
.call div:nth-child(1)::before{content:"🎧  "}
.call div:nth-child(2)::before{content:"👀  "}
.call div:nth-child(3)::before{content:"💡  "}
.stat{display:flex;flex-direction:column;gap:6px;width:300px;flex:none}
.stat b{font-size:92px;line-height:1;font-weight:800;color:#ffe27a;letter-spacing:-.03em}
.stat span{font-size:22px;color:#c9c9d3;line-height:1.35}
.popup{width:300px;border-radius:14px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1);flex:none}
.popup img{display:block;width:100%}
ul.b{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px;margin-top:22px}
ul.b li{font-size:21px;color:#e6e6ee}
ul.b li::before{content:"✓  ";color:#ffe27a;font-weight:800}
.priv{display:flex;flex-direction:column;gap:16px;min-width:300px}
.priv div{padding:18px 22px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
.priv div b{display:block;font-size:24px}
.priv div b::before{content:"🔒  "}
.priv div span{display:block;font-size:18px;color:#b9b9c6;margin-top:4px}
`;

function shotHtml(c, s, popupDataUrl) {
  // Long titles (French, German, Hindi run long) step down so the player still fits the frame.
  const room = s.popup ? 24 : 36, len = [...s.title].length;
  const size = len <= room ? 60 : len <= room * 1.35 ? 50 : 44;
  const head = `<div class="eyebrow">${icon}${s.eyebrow}</div><h1 style="font-size:${size}px">${s.title}</h1><p class="sub">${s.sub}</p>`;
  let body;
  if (s.chips) body = `${head}<div class="chips">${s.chips.map(x => `<span class="chip">${x}</span>`).join("")}</div><div style="margin-top:26px;display:flex;justify-content:center">${player(s.scene, 790, s)}</div>`;
  else if (s.callouts) body = `${head}<div class="row">${player(s.scene, 820, s)}<div class="call">${s.callouts.map(x => `<div>${x}</div>`).join("")}</div></div>`;
  else if (s.stat) body = `${head}<div class="row"><div class="stat"><b style="font-size:${[...s.stat[0]].length > 7 ? 60 : 88}px">${s.stat[0]}</b><span>${s.stat[1]}</span></div>${player(s.scene, 820, s)}</div>`;
  else if (s.popup) body = `<div class="row" style="margin-top:0;align-items:flex-start"><div style="flex:1">${head}<ul class="b">${s.bullets.map(x => `<li>${x}</li>`).join("")}</ul><div style="margin-top:24px">${player(s.scene, 580, { ...s, transFirst: true })}</div></div><div class="popup" style="margin-top:20px"><img src="${popupDataUrl}"></div></div>`;
  else body = `${head}<div class="row">${player(s.scene, 780, s)}<div class="priv">${s.privacy.map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join("")}</div></div>`;
  return `<html><head><style>${CSS(c.font)}</style></head><body><div class="frame">${body}</div></body></html>`;
}

function promoHtml(c, w, h, marquee) {
  const m = c.marquee;
  if (!marquee) return `<html><head><style>${CSS(c.font)}</style></head><body><div style="width:${w}px;height:${h}px;background:radial-gradient(ellipse at 30% 0%,#3a3058,#121217 70%);display:flex;align-items:center;gap:22px;padding:0 34px">
    <div style="width:104px;height:104px;flex:none">${icon.replace("<svg", '<svg width="104" height="104"')}</div>
    <div><div style="font-size:44px;font-weight:800;letter-spacing:-.02em">${c.promo.title}</div><div style="font-size:21px;color:#e6e6ee;margin-top:4px">${c.promo.sub}</div>
    <div style="display:inline-block;margin-top:12px;padding:6px 14px;border-radius:999px;background:#ffe27a;color:#111;font-weight:700;font-size:16px">${c.promo.tag}</div></div></div></body></html>`;
  return `<html><head><style>${CSS(c.font)}</style></head><body><div style="width:${w}px;height:${h}px;background:radial-gradient(ellipse at 20% 0%,#2f2850,#121217 65%);display:flex;align-items:center;gap:48px;padding:0 64px">
    <div style="flex:1"><div class="eyebrow">${icon}Twinsub</div><h1 style="font-size:58px">${m.title}</h1><p class="sub" style="font-size:23px">${m.sub}</p></div>
    ${player("city", 620, m)}</div></body></html>`;
}

// Real popup, rendered from popup.html with a stub for chrome.i18n and chrome.storage.
async function popupShot(browser, locale) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `_locales/${locale}/messages.json`), "utf8"));
  const page = await browser.newPage({ viewport: { width: 320, height: 540 }, deviceScaleFactor: 2, colorScheme: "dark", locale: locale.replace("_", "-") });
  await page.addInitScript(([msgs, ui]) => {
    window.chrome = {
      i18n: { getMessage: (k, subs) => { const m = msgs[k]; if (!m) return ""; let s = m.message; (subs || []).forEach((v, i) => { s = s.split("$" + (i + 1)).join(v); }); return s; }, getUILanguage: () => ui },
      storage: { sync: { get: d => Promise.resolve({ ...d, target: "auto" }), set: () => Promise.resolve() } },
    };
  }, [messages, locale.replace("_", "-")]);
  await page.goto("file://" + path.join(root, "popup/popup.html"));
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => document.body.scrollHeight);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: h } });
  await page.close();
  return "data:image/png;base64," + buf.toString("base64");
}

(async () => {
  const browser = await chromium.launch();
  for (const [locale, c] of Object.entries(COPY)) {
    const dir = path.join(root, "store/screenshots", locale);
    fs.mkdirSync(dir, { recursive: true });
    const popup = await popupShot(browser, locale);
    for (const [i, s] of c.shots.entries()) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.setContent(shotHtml(c, s, popup));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(dir, `${i + 1}.png`) });
      await page.close();
    }
    fs.mkdirSync(path.join(root, "store/promo"), { recursive: true });
    for (const [w, h, marquee, name] of [[440, 280, false, "small-440x280"], [1400, 560, true, "marquee-1400x560"]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(promoHtml(c, w, h, marquee));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(root, "store/promo", `${name}-${locale}.png`) });
      await page.close();
    }
    console.log(locale, "done");
  }
  await browser.close();
})();
