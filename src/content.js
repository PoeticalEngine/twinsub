// Twinsub content script (isolated world). Owns the settings, the player button, the two-line overlay and the
// translation queue. Caption files and the Translator itself live in page.js; see the note there.
(() => {
  if (window.__twinsubContent) return;
  window.__twinsubContent = true;

  const C = TwinsubCaptions;
  const FROM_PAGE = "twinsub-page", FROM_CONTENT = "twinsub-content";
  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

  // ---- strings -------------------------------------------------------------------------------------------
  const EN = {
    buttonOn: "Twinsub dual subtitles: on (click to turn off)",
    buttonOff: "Twinsub dual subtitles: off (click to turn on)",
    noApi: "Twinsub translates on your computer, which needs Chrome 138 or newer on a desktop or laptop.",
    unsupported: "On-device translation from $1 to $2 isn't available in Chrome yet. Showing the original subtitles.",
    needsDownload: "Click to download the $1 → $2 translation pack (one time, a few seconds)",
    downloading: "Downloading the $1 → $2 translation pack… $3%",
    noCaptions: "This video has no subtitles, so Twinsub has nothing to translate.",
    failed: "Translation stopped: $1",
    askTip: "Didn't catch that? ($1)",
    panelTitle: "Didn't catch that?",
    panelHint: "Mark the parts of the translation you don't get, as many as you like. Or explain the whole line.",
    panelHintNoTr: "Mark the parts you don't get, as many as you like. Or explain the whole line.",
    explainThis: "Explain this",
    explainLine: "Explain whole line",
    justNow: "just now",
    footerHint: "Mark something, then tap Explain",
    remaining: "$1 free explanations left today",
    aiNote: "Written by AI, may be wrong",
    secGist: "What it says",
    secBackground: "Background",
    secLanguage: "Language",
    secAsr: "Maybe misheard",
    quotaTitle: "That's today's $1 free explanations",
    quotaBody: "They come back tomorrow. Your marks stay where they are.",
    remainingPro: "$1 explanations left this month",
    quotaTitlePro: "That's this month's $1 explanations",
    quotaBodyPro: "They come back on the 1st of next month.",
    quotaUpgrade: "Get Pro: 1,000 a month for $$4.99",
    quotaRestoreHint: "Already have Pro or Lifetime? Enter your code in the Twinsub menu (the extension icon).",
    quotaOwnKey: "Or $$14.90 once: your own API key, nothing through our server",
    byokFooter: "Your own key \u00b7 $1",
    byokLocked: "Your own API key is turned on, but it isn't unlocked on this computer. Get Lifetime or enter your code in the AI settings.",
    byokSetup: "Your own API key is turned on but not set up yet.",
    byokOpenSettings: "Open AI settings",
    byokKeyBad: "$1 turned down your API key. Check it in the AI settings.",
    byokRate: "$1 says you've hit your rate limit or run out of credit.",
    byokErr: "$1 returned an error.",
    errFailed: "Couldn't get an explanation.",
    errBusy: "Lots of people are asking right now. Try again in a minute.",
    retry: "Try again",
    thinking: "Thinking…",
    close: "Close",
  };
  function t(key, ...subs) {
    let s = "";
    try { s = hasChrome && chrome.i18n ? chrome.i18n.getMessage(key, subs) : ""; } catch {}
    if (!s) s = (EN[key] || key).replace(/\$(\$|\d)/g, (_, n) => n === "$" ? "$" : subs[n - 1] ?? "");
    return s;
  }
  const langName = code => {
    try { return new Intl.DisplayNames([navigator.language], { type: "language" }).of(code) || code; } catch { return code; }
  };

  // ---- settings ------------------------------------------------------------------------------------------
  const DEFAULTS = { enabled: true, target: "auto", order: "original-first", showOriginal: true, showTranslation: true, size: 1, bottom: 10 };
  let settings = { ...DEFAULTS };
  const store = {
    async get() { return hasChrome ? chrome.storage.sync.get(DEFAULTS) : { ...DEFAULTS, ...settings }; },
    async set(v) { if (hasChrome) await chrome.storage.sync.set(v); else Object.assign(settings, v); },
  };
  const targetLang = () => settings.target === "auto" ? (C.translatorLang(navigator.language) || "en") : settings.target;

  // ---- page bridge ---------------------------------------------------------------------------------------
  let nextId = 1;
  const pending = new Map();
  function rpc(type, data = {}) {
    const id = "ts" + nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.postMessage({ source: FROM_CONTENT, id, type, ...data }, location.origin);
    });
  }

  const files = new Map();   // "<videoId>|<lang>|<kind>|<tlang>" -> { meta, body }
  let track = { ready: false };

  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.source !== FROM_PAGE) return;
    const d = e.data;
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id); pending.delete(d.id);
      d.error ? p.reject(new Error(d.error)) : p.resolve(d.value !== undefined ? d.value : d.ok);
    } else if (d.type === "captions") {
      const m = d.meta;
      files.set([m.videoId, m.lang, m.kind, m.tlang].join("|"), { meta: m, body: d.body });
      refresh();
    } else if (d.type === "track") {
      track = d.state;
      refresh();
    } else if (d.type === "download") {
      if (job && job.src === d.src && job.tgt === d.tgt && d.loaded < 1)
        chip(t("downloading", langName(d.src), langName(d.tgt), String(Math.round(d.loaded * 100))));
    }
  });

  // ---- state -----------------------------------------------------------------------------------------------
  let currentKey = "", cues = [], translations = [], job = null, shownIndex = -2;
  let askedOnFor = "", sameVideoSince = 0, lastVideo = "";

  function refresh() {
    ensureUi();
    if (button) {
      button.setAttribute("aria-pressed", String(settings.enabled));
      button.title = settings.enabled ? t("buttonOn") : t("buttonOff");
    }
    if (!settings.enabled || !track.ready) { hide(); return; }
    TwinsubExplain.sync();
    if (track.videoId !== lastVideo) { lastVideo = track.videoId; sameVideoSince = Date.now(); chip(""); }
    if (track.ad) { hide(); return; }

    if (!track.on) {
      if (track.hasTracks && askedOnFor !== track.videoId) { askedOnFor = track.videoId; rpc("captionsOn").catch(() => {}); }
      else if (!track.hasTracks && Date.now() - sameVideoSince > 4000) chip(t("noCaptions"), { timeout: 6000, once: "nocap:" + track.videoId });
      clearCues();
      return;
    }
    const key = [track.videoId, track.lang, track.kind, track.tlang].join("|");
    if (key === currentKey) return;
    const file = files.get(key);
    if (!file) { if (currentKey) clearCues(); return; }  // the file arrives with the next "captions" message
    currentKey = key;
    cues = C.parse(file.body, track.kind);
    resetTranslations();
    shownIndex = -2;
    startTranslation();
  }

  function clearCues() { currentKey = ""; cues = []; job = null; shownIndex = -2; resetTranslations(); render(); }

  // ---- translation -----------------------------------------------------------------------------------------
  async function startTranslation(withGesture = false) {
    const src = C.translatorLang(track.tlang || track.lang), tgt = targetLang();
    const my = job = { src, tgt, key: currentKey };
    if (!src || !tgt) { chip(t("unsupported", langName(track.tlang || track.lang), langName(tgt)), { timeout: 8000 }); return; }
    if (src === tgt || src.split("-")[0] === tgt.split("-")[0] && src !== "zh" && tgt !== "zh") { chip(""); return; }
    let avail;
    try { avail = await rpc("availability", { src, tgt }); } catch (e) { avail = "no-api"; }
    if (job !== my) return;
    if (avail === "no-api") { chip(t("noApi"), { timeout: 10000, once: "noapi" }); return; }
    if (avail === "unavailable") { chip(t("unsupported", langName(src), langName(tgt)), { timeout: 8000 }); return; }
    if (avail !== "available" && !withGesture) {
      chip(t("needsDownload", langName(src), langName(tgt)), { action: () => startTranslation(true) });
      return;
    }
    try {
      if (avail !== "available") chip(t("downloading", langName(src), langName(tgt), "0"));
      await rpc("prepare", { src, tgt });  // sent inside the click, while the page still has user activation
      chip("");
      await translateAll(my);
    } catch (e) {
      if (job === my) chip(t("failed", e.message), { timeout: 8000 });
    }
  }

  function resetTranslations() { translations = new Array(cues.length); }
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const anchor = () => {
    const video = document.querySelector("#movie_player video");
    return Math.max(0, C.anchorAt(cues, (video ? video.currentTime : 0) * 1000));
  };

  // The whole transcript is translated as numbered text (see captions.js), 200 lines at a time, so each line is
  // translated with the conversation around it. The chunk the viewer is in goes first, including after a seek.
  // Lines whose number didn't come back cleanly (Japanese likes to merge half-sentences) are translated again
  // with 3 lines either side, and whatever is still broken after that, one line at a time.
  async function translateAll(my) {
    const todo = C.chunks(cues.length, anchor());
    while (todo.length) {
      const here = anchor();
      const r = todo.splice(Math.max(0, todo.findIndex(c => c.start <= here && here < c.end)), 1)[0];
      const idx = range(r.start, r.end);
      const lines = await translateNumbered(my, idx);
      if (job !== my) return;
      idx.forEach((k, j) => { if (lines[j] !== null) translations[k] = lines[j]; });

      await Promise.all(C.runs(idx.filter((k, j) => lines[j] === null)).map(async run => {
        const w = range(Math.max(0, run[0] - 3), Math.min(cues.length, run[run.length - 1] + 4));
        const got = await translateNumbered(my, w);
        if (job === my) w.forEach((k, j) => { if (run.includes(k) && got[j] !== null) translations[k] = got[j]; });
      }));
      if (job !== my) return;

      const left = idx.filter(k => translations[k] === undefined);
      if (left.length) {
        const each = await rpc("translate", { src: my.src, tgt: my.tgt, texts: left.map(k => cues[k].text) });
        if (job !== my) return;
        left.forEach((k, j) => { translations[k] = each[j] || ""; });
      }
      shownIndex = -2;
    }
  }

  async function translateNumbered(my, idx) {
    const [text] = await rpc("translate", { src: my.src, tgt: my.tgt, texts: [C.joinNumbered(idx.map(k => cues[k].text))] });
    return C.splitNumbered(text, idx.length);
  }

  // ---- UI ----------------------------------------------------------------------------------------------------
  let button = null, overlay = null, lineA = null, lineB = null, chipEl = null, chipTimer = 0;
  const shownOnce = new Set();

  function ensureUi() {
    const player = document.getElementById("movie_player");
    if (!player) return;
    if (!overlay || !player.contains(overlay)) {
      overlay = document.createElement("div");
      overlay.className = "twinsub-overlay";
      lineA = document.createElement("div"); lineA.className = "twinsub-line twinsub-a";
      lineB = document.createElement("div"); lineB.className = "twinsub-line twinsub-b";
      overlay.append(lineA, lineB);
      chipEl = document.createElement("button");
      chipEl.type = "button";
      chipEl.className = "twinsub-chip";
      chipEl.hidden = true;
      player.append(overlay, chipEl);
      TwinsubExplain.attach(overlay);
      new ResizeObserver(() => player.style.setProperty("--twinsub-base", Math.max(14, player.clientHeight * 0.045) + "px")).observe(player);
      applyStyle();
    }
    const controls = player.querySelector(".ytp-right-controls");
    if (controls && (!button || !controls.contains(button))) {
      button = document.createElement("button");
      button.className = "ytp-button twinsub-button";
      button.setAttribute("aria-pressed", String(settings.enabled));
      button.title = settings.enabled ? t("buttonOn") : t("buttonOff");
      button.append(icon());
      button.addEventListener("click", async () => {
        const enabled = !settings.enabled;
        settings.enabled = enabled;
        await store.set({ enabled });
        if (enabled) { askedOnFor = ""; currentKey = ""; }
        refresh();
        if (enabled && job && chipEl && chipEl.dataset.action === "1") startTranslation(true);
      });
      controls.prepend(button);
    }
  }

  function icon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 36 36");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    const box = document.createElementNS(ns, "rect");
    Object.entries({ x: 8, y: 10, width: 20, height: 16, rx: 3, fill: "none", stroke: "currentColor", "stroke-width": 2 }).forEach(([k, v]) => box.setAttribute(k, v));
    const l1 = document.createElementNS(ns, "path");
    l1.setAttribute("d", "M12 16h12");
    const l2 = document.createElementNS(ns, "path");
    l2.setAttribute("d", "M12 21h8");
    for (const l of [l1, l2]) { l.setAttribute("stroke", "currentColor"); l.setAttribute("stroke-width", "2"); l.setAttribute("stroke-linecap", "round"); }
    l2.setAttribute("class", "twinsub-icon-second");
    svg.append(box, l1, l2);
    return svg;
  }

  function applyStyle() {
    const player = document.getElementById("movie_player");
    if (!player) return;
    player.style.setProperty("--twinsub-scale", String(settings.size));
    player.style.setProperty("--twinsub-bottom", settings.bottom + "%");
    shownIndex = -2;
  }

  function chip(text, opts = {}) {
    if (!chipEl) return;
    clearTimeout(chipTimer);
    if (!text || (opts.once && shownOnce.has(opts.once))) { if (!text) { chipEl.hidden = true; chipEl.onclick = null; delete chipEl.dataset.action; } return; }
    if (opts.once) shownOnce.add(opts.once);
    chipEl.textContent = text;
    chipEl.hidden = false;
    chipEl.classList.toggle("twinsub-chip-action", !!opts.action);
    if (opts.action) { chipEl.dataset.action = "1"; chipEl.onclick = () => { chipEl.onclick = null; opts.action(); }; }
    else { delete chipEl.dataset.action; chipEl.onclick = null; }
    if (opts.timeout) chipTimer = setTimeout(() => { chipEl.hidden = true; }, opts.timeout);
  }

  function hide() { if (overlay) overlay.hidden = true; }

  // YouTube's own captions have to stay on (that's how the caption file gets downloaded), so hide them while
  // Twinsub shows its lines. A stylesheet of our own, switched on and off, rather than a class on <html>, which
  // the page or other extensions can overwrite.
  let nativeStyle = null;
  function hideNative(on) {
    if (!nativeStyle || !nativeStyle.isConnected) {
      nativeStyle = document.createElement("style");
      nativeStyle.textContent = ".html5-video-player .ytp-caption-window-container, .html5-video-player .caption-window { display: none !important; }";
      (document.head || document.documentElement).append(nativeStyle);
    }
    nativeStyle.disabled = !on;
  }

  function render() {
    if (!overlay) return;
    const video = document.querySelector("#movie_player video");
    hideNative(!!(settings.enabled && track.on && !track.ad && cues.length));
    if (!settings.enabled || !track.on || track.ad || !cues.length || !video) { overlay.hidden = true; return; }
    const i = C.cueAt(cues, video.currentTime * 1000);
    if (i === shownIndex) return;
    shownIndex = i;
    if (i < 0) { overlay.hidden = true; return; }
    const orig = settings.showOriginal ? cues[i].text : "";
    const tr = settings.showTranslation && job && job.key === currentKey ? (translations[i] || "") : "";
    const [first, second] = settings.order === "translation-first" ? [tr, orig] : [orig, tr];
    lineA.textContent = first; lineA.hidden = !first;
    lineB.textContent = second; lineB.hidden = !second;
    lineA.classList.toggle("twinsub-translation", settings.order === "translation-first");
    lineB.classList.toggle("twinsub-translation", settings.order !== "translation-first");
    lineA.lang = settings.order === "translation-first" ? targetLang() : (track.tlang || track.lang);
    lineB.lang = settings.order === "translation-first" ? (track.tlang || track.lang) : targetLang();
    overlay.hidden = !first && !second;
  }

  TwinsubExplain.mount({
    t, player: () => document.getElementById("movie_player"), video: () => document.querySelector("#movie_player video"),
    cues: () => cues, translations: () => translations, track: () => track, key: () => currentKey,
    sourceLang: () => track.tlang || track.lang || "", targetLang,
    videoMeta: () => ({
      id: track.videoId || "",
      title: (document.querySelector("#title h1, h1.ytd-watch-metadata")?.textContent || document.title.replace(/ - YouTube$/, "")).trim(),
      channel: (document.querySelector("ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a")?.textContent || "").trim(),
    }),
  });

  setInterval(render, 100);
  // YouTube is a single-page app: the player and its controls get rebuilt on navigation.
  document.addEventListener("yt-navigate-finish", () => { askedOnFor = ""; refresh(); });
  setInterval(() => { if (settings.enabled) ensureUi(); }, 2000);

  if (hasChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const before = targetLang();
      for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
      applyStyle();
      if (targetLang() !== before && cues.length) { resetTranslations(); startTranslation(); }
      refresh();
    });
  }

  store.get().then(v => {
    settings = { ...DEFAULTS, ...v };
    applyStyle();
    window.postMessage({ source: FROM_CONTENT, type: "replay" }, location.origin);
    refresh();
  });
})();
