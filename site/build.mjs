// Builds the static landing site into site/dist: one page per locale (en at /), the privacy policy,
// sitemap with hreflang alternates, robots.txt, llms.txt / llms-full.txt and the IndexNow key file.
// Copy comes from site/content/<locale>.json and the store copy in store/copy; screenshots from store/screenshots.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dist = path.join(here, "dist");
const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const ORIGIN = config.origin;

const LOCALES = [
  { key: "en", dir: "", lang: "en", hreflang: "en" },
  { key: "zh_CN", dir: "zh", lang: "zh-CN", hreflang: "zh-Hans" },
  { key: "ja", dir: "ja", lang: "ja", hreflang: "ja" },
  { key: "ko", dir: "ko", lang: "ko", hreflang: "ko" },
  { key: "fr", dir: "fr", lang: "fr", hreflang: "fr" },
  { key: "de", dir: "de", lang: "de", hreflang: "de" },
  { key: "es", dir: "es", lang: "es", hreflang: "es" },
  { key: "hi", dir: "hi", lang: "hi", hreflang: "hi" },
  { key: "id", dir: "id", lang: "id", hreflang: "id" },
];
for (const l of LOCALES) {
  l.c = JSON.parse(fs.readFileSync(path.join(here, "content", `${l.key}.json`), "utf8"));
  l.store = JSON.parse(fs.readFileSync(path.join(root, "store", "copy", `${l.key}.json`), "utf8"));
  l.url = `${ORIGIN}/${l.dir ? l.dir + "/" : ""}`;
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const write = (rel, data) => { const f = path.join(dist, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

// Shots 1–4 of the store set; shot 5 ("no server") predates explanations and is left out.
const SHOTS = [0, 1, 2, 3];

function images() {
  for (const l of LOCALES) {
    for (const i of SHOTS) {
      const out = path.join(dist, "img", l.key, `${i + 1}.webp`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      execFileSync("cwebp", ["-quiet", "-q", "78", path.join(root, "store", "screenshots", l.key, `${i + 1}.png`), "-o", out]);
    }
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", path.join(root, "store", "promo", `marquee-1400x560-${l.key}.png`), "--out", path.join(dist, "img", l.key, "og.jpg")], { stdio: "ignore" });
  }
  fs.copyFileSync(path.join(root, "icons", "icon.svg"), path.join(dist, "icon.svg"));
  fs.copyFileSync(path.join(root, "icons", "128.png"), path.join(dist, "icon-128.png"));
  fs.copyFileSync(path.join(root, "icons", "32.png"), path.join(dist, "favicon.png"));
}

const CSS = `
:root{--bg:#0f0f0f;--panel:#181819;--line:#2a2a2d;--fg:#f4f4f5;--mute:#a1a1aa;--dim:#8f8f96;--accent:#ffe27a;--mark:rgba(255,226,122,.28)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans","Noto Sans",Arial,sans-serif}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;text-decoration:none}
.brand img{width:30px;height:30px}
.langs{position:relative}
.langs summary{list-style:none;cursor:pointer;color:var(--mute);font-size:14px;padding:6px 10px;border:1px solid var(--line);border-radius:8px}
.langs summary::-webkit-details-marker{display:none}
.langs ul{position:absolute;right:0;top:110%;margin:0;padding:6px;list-style:none;background:var(--panel);border:1px solid var(--line);border-radius:10px;min-width:170px;z-index:5}
.langs li a{display:block;padding:6px 10px;border-radius:6px;text-decoration:none;font-size:14px}
.langs li a:hover,.langs li a[aria-current]{background:#26262a}
.hero{text-align:center;padding:48px 0 24px}
h1{font-size:clamp(34px,6vw,60px);line-height:1.1;margin:0 0 18px;letter-spacing:-.02em}
.hero p.sub{font-size:clamp(17px,2.2vw,20px);color:var(--mute);max-width:680px;margin:0 auto 28px}
.cta{display:inline-block;background:var(--accent);color:#111;font-weight:700;padding:14px 26px;border-radius:999px;text-decoration:none;font-size:17px}
.cta.soon{background:#26262a;color:var(--fg);font-weight:600;cursor:default}
.note{color:var(--dim);font-size:14px;margin-top:14px}
.src{color:var(--dim);font-size:14px;margin-left:14px}
.shot{display:block;width:100%;height:auto;border-radius:14px;border:1px solid var(--line)}
.hero .shot{margin-top:40px}
h2{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:0 0 14px;letter-spacing:-.01em}
section{padding:56px 0}
.feat{display:grid;grid-template-columns:1fr 1.4fr;gap:40px;align-items:center;margin:48px 0}
.feat:nth-child(odd) .txt{order:2}
.feat h3{font-size:26px;line-height:1.25;margin:0 0 10px}
.feat p{color:var(--mute);margin:0;font-size:17px}
.eyebrow{color:var(--accent);font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;margin:0 0 8px}
.explain{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.explain p.lead{color:var(--mute);font-size:17px}
.explain ol,.how ol{padding-left:22px;margin:18px 0 0}
.explain li,.how li{margin:8px 0}
.quota{color:var(--dim);font-size:14px;margin-top:18px}
.demo{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
.demo .bar{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;margin-bottom:14px;color:var(--mute)}
.demo .bar i{width:18px;height:14px;border:2.5px solid var(--fg);border-radius:4px;display:inline-block}
.demo .tr{font-size:19px;line-height:1.5}
.demo mark{background:var(--mark);color:var(--fg);border-bottom:2px solid var(--accent);padding:0 1px}
.demo .orig{color:var(--dim);font-size:14px;margin-top:6px}
.answer{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}
.answer b{display:block;color:var(--accent);font-size:13px;font-weight:600;margin-top:10px}
.answer p{margin:2px 0 0;font-size:15px}
.how ol{font-size:17px}
.faq details{border-bottom:1px solid var(--line);padding:16px 0}
.faq summary{cursor:pointer;font-weight:600;font-size:18px}
.faq details p{color:var(--mute);margin:10px 0 0}
.final{text-align:center}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--dim);font-size:14px}
footer nav{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:10px}
.doc{max-width:760px}
.doc h1{font-size:36px;margin-top:24px}
.doc h2{font-size:22px;margin-top:32px}
.doc p,.doc li{color:#d4d4d8}
.doc code{background:#26262a;padding:1px 5px;border-radius:4px}
@media (max-width:780px){.feat,.explain{grid-template-columns:1fr;gap:20px}.feat:nth-child(odd) .txt{order:0}section{padding:36px 0}.src{display:block;margin:12px 0 0}}
`;

function head({ l, title, description, url, alternates, og, jsonld = [] }) {
  return `<!doctype html>
<html lang="${l.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${(alternates || []).map(a => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.url}">`).join("\n")}
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/icon-128.png">
<meta name="theme-color" content="#0f0f0f">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Twinsub">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1400">
<meta property="og:image:height" content="560">
<meta property="og:locale" content="${l.lang.replace("-", "_")}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
<style>${CSS.trim()}</style>
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>`;
}

const alternates = [...LOCALES.map(l => ({ hreflang: l.hreflang, url: l.url })), { hreflang: "x-default", url: LOCALES[0].url }];

function chrome(l, here) {
  const langs = LOCALES.map(o => `<li><a href="/${o.dir ? o.dir + "/" : ""}" hreflang="${o.hreflang}" lang="${o.lang}"${o === here ? ' aria-current="page"' : ""}>${esc(o.c.langName)}</a></li>`).join("");
  return `<div class="wrap"><header><a class="brand" href="/${l.dir ? l.dir + "/" : ""}"><img src="/icon.svg" alt="" width="30" height="30">Twinsub</a>
<details class="langs"><summary>${esc(here ? here.c.langName : "Language")} ▾</summary><ul>${langs}</ul></details></header></div>`;
}

function footer(l) {
  const c = l.c;
  return `<footer><div class="wrap"><nav><a href="/privacy/">${esc(c.footer.privacy)}</a><a href="/terms/">${esc(c.footer.terms)}</a><a href="${config.github}">GitHub</a><a href="mailto:hello@poeticalengine.com">hello@poeticalengine.com</a><a href="/llms.txt">llms.txt</a></nav>
<div>${esc(c.footer.by)} · Poetical Engine LLC</div><div>${esc(c.footer.disclaimer)}</div></div></footer>
</body></html>
`;
}

const ctaHtml = c => config.cws
  ? `<a class="cta" href="${config.cws}">${esc(c.cta)}</a>`
  : `<span class="cta soon">${esc(c.soon)}</span>`;

function page(l) {
  const c = l.c, e = c.explain, shots = l.store.shots;
  const hl = esc(e.tr).replace(esc(e.mark), `<mark>${esc(e.mark)}</mark>`);
  const app = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Twinsub",
    alternateName: l.store.messages.extName, description: c.meta.description, url: l.url,
    image: `${ORIGIN}/img/${l.key}/1.webp`, applicationCategory: "BrowserApplication", applicationSubCategory: "Browser extension",
    operatingSystem: "Chrome 138+ on Windows, macOS, Linux, ChromeOS", softwareVersion: manifest.version, inLanguage: l.lang,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(config.cws ? { downloadUrl: config.cws, installUrl: config.cws } : {}),
    publisher: { "@type": "Organization", name: "Poetical Engine LLC", url: "https://poeticalengine.com", email: "hello@poeticalengine.com" },
    sameAs: [config.github, ...(config.cws ? [config.cws] : [])],
  };
  const faq = {
    "@context": "https://schema.org", "@type": "FAQPage", inLanguage: l.lang,
    mainEntity: c.faq.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const feats = SHOTS.slice(1).map(i => `<div class="feat"><div class="txt"><h3>${esc(shots[i].title)}</h3><p>${esc(shots[i].sub)}</p></div>
<img class="shot" src="/img/${l.key}/${i + 1}.webp" width="1280" height="800" loading="lazy" alt="${esc(shots[i].title)}"></div>`).join("\n");
  return head({ l, title: c.meta.title, description: c.meta.description, url: l.url, alternates, og: `${ORIGIN}/img/${l.key}/og.jpg`, jsonld: [app, faq] })
    + chrome(l, l) + `
<main>
<div class="wrap hero">
<h1>${esc(c.hero.h1)}</h1>
<p class="sub">${esc(c.hero.sub)}</p>
<div>${ctaHtml(c)}<a class="src" href="${config.github}">GitHub ↗</a></div>
<p class="note">${esc(c.hero.note)}</p>
<img class="shot" src="/img/${l.key}/1.webp" width="1280" height="800" fetchpriority="high" alt="${esc(shots[0].title)} ${esc(shots[0].sub)}">
</div>
<section class="wrap"><h2>${esc(c.featuresTitle)}</h2>
${feats}
</section>
<section class="wrap explain" id="explain">
<div><p class="eyebrow">${esc(e.eyebrow)}</p><h2>${esc(e.title)}</h2><p class="lead">${esc(e.sub)}</p>
<ol>${e.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol><p class="quota">${esc(e.quota)}</p></div>
<div class="demo" aria-label="${esc(e.title)}"><div class="bar"><i></i>${esc(e.eyebrow)}</div>
<div class="tr">${hl}</div><div class="orig">${esc(e.orig)}</div>
<div class="answer"><b>${esc(e.labels.gist)}</b><p>${esc(e.gist)}</p><b>${esc(e.labels.background)}</b><p>${esc(e.background)}</p></div></div>
</section>
<section class="wrap how"><h2>${esc(c.how.title)}</h2><ol>${c.how.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></section>
<section class="wrap faq"><h2>${esc(c.faq.title)}</h2>
${c.faq.items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
</section>
<section class="wrap final">${ctaHtml(c)}<p class="note">${esc(c.hero.note)}</p></section>
</main>
` + footer(l);
}

// Just enough Markdown for PRIVACY.md and TERMS.md: headings, bullet lists, paragraphs, bold and code.
function markdown(md) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(hello@poeticalengine\.com)/g, '<a href="mailto:$1">$1</a>');
  const out = [];
  let list = false;
  for (const line of md.split("\n")) {
    if (/^- /.test(line)) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    const h = line.match(/^(#{1,3}) (.*)/);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}

const privacyMd = fs.readFileSync(path.join(root, "PRIVACY.md"), "utf8");
const termsMd = fs.readFileSync(path.join(root, "TERMS.md"), "utf8");

function privacy() {
  const l = LOCALES[0];
  return head({ l, title: "Twinsub privacy policy", description: "What Twinsub keeps on your computer, what it sends when you tap Explain, and what our server stores.", url: `${ORIGIN}/privacy/`, og: `${ORIGIN}/img/en/og.jpg` })
    + chrome(l, l) + `<main class="wrap doc">${markdown(privacyMd)}</main>` + footer(l);
}

function terms() {
  const l = LOCALES[0];
  return head({ l, title: "Twinsub terms of use", description: "What is free, how Twinsub Pro works, and what explanations send to our server.", url: `${ORIGIN}/terms/`, og: `${ORIGIN}/img/en/og.jpg` })
    + chrome(l, l) + `<main class="wrap doc">${markdown(termsMd)}</main>` + footer(l);
}

function notFound() {
  const l = LOCALES[0];
  return head({ l, title: "Not found · Twinsub", description: "This page doesn't exist.", url: `${ORIGIN}/`, og: `${ORIGIN}/img/en/og.jpg` })
    .replace("<head>", '<head>\n<meta name="robots" content="noindex">')
    + chrome(l, l) + `<main class="wrap hero"><h1>Page not found</h1><p class="sub"><a href="/">Twinsub home</a></p></main>` + footer(l);
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const alt = alternates.map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.url}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LOCALES.map(l => `<url><loc>${l.url}</loc><lastmod>${today}</lastmod>${alt}</url>`).join("\n")}
<url><loc>${ORIGIN}/privacy/</loc><lastmod>${today}</lastmod></url>
<url><loc>${ORIGIN}/terms/</loc><lastmod>${today}</lastmod></url>
</urlset>
`;
}

function llms() {
  const c = LOCALES[0].c;
  return `# Twinsub

> Twinsub is a free Chrome extension that shows dual subtitles on YouTube: the original subtitle line and a translation into the viewer's language right under it. Translation runs on the viewer's own computer with Chrome's built-in Translator (Chrome 138+), so it is free and unlimited, with no account. A "Didn't catch that?" panel lets the viewer mark part of a translated line and get an AI explanation of the original words: meaning, idioms, field terms, cultural background and memes.

Key facts:
- Price: free. Dual subtitles are unlimited. AI explanations: 5 free per day.
- Works on: youtube.com in Chrome 138 or newer on Windows, macOS, Linux and ChromeOS.
- Subtitles: hand-made and auto-generated tracks; auto-generated captions are regrouped into whole sentences before translating.
- Target languages: 39, including English, Chinese (Simplified and Traditional), Japanese, Korean, Spanish, French, German, Portuguese, Russian, Arabic, Hindi, Indonesian and Vietnamese.
- Privacy: subtitle translation never leaves the computer. Only when the viewer taps Explain are the marked words and nearby subtitle lines sent to the Twinsub server, which asks Anthropic's Claude for the answer.
- Publisher: Poetical Engine LLC (hello@poeticalengine.com). Source code: ${config.github}
- Status: version ${manifest.version}${config.cws ? `, on the Chrome Web Store: ${config.cws}` : ", Chrome Web Store listing coming soon"}.
- Not affiliated with YouTube or Google.

## Pages

${LOCALES.map(l => `- [${l.c.meta.title}](${l.url}): ${l.c.langName}`).join("\n")}
- [Privacy policy](${ORIGIN}/privacy/)
- [Terms of use](${ORIGIN}/terms/): free limits, Twinsub Pro, what explanations send

## Optional

- [Full text for language models](${ORIGIN}/llms-full.txt): features, FAQ and privacy policy in one file
`;
}

function llmsFull() {
  const l = LOCALES[0], c = l.c, e = c.explain;
  return `# Twinsub: dual subtitles for YouTube

${ORIGIN}/ · ${c.meta.description}

${c.hero.sub}

${SHOTS.map(i => `- ${l.store.shots[i].title} ${l.store.shots[i].sub}`).join("\n")}

## How to start

${c.how.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Didn't catch that? AI explanations

${e.sub}

${e.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Example. Original line: "${e.orig}" The viewer marks "${e.mark}" in the translation "${e.tr}"
- ${e.labels.gist}: ${e.gist}
- ${e.labels.background}: ${e.background}

${e.quota}

## FAQ

${c.faq.items.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}

${privacyMd.replace(/^# /m, "## ")}
`;
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
images();
for (const l of LOCALES) write(path.join(l.dir, "index.html"), page(l));
write("privacy/index.html", privacy());
write("terms/index.html", terms());
write("404.html", notFound());
write("sitemap.xml", sitemap());
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
write("llms.txt", llms());
write("llms-full.txt", llmsFull());
write(`${config.indexnow}.txt`, config.indexnow);
write("_headers", `/img/*\n  Cache-Control: public, max-age=2592000\n/*.txt\n  Content-Type: text/plain; charset=utf-8\n`);
console.log(`built ${LOCALES.length} locales into ${path.relative(root, dist)}`);
