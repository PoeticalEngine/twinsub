// Runs in YouTube's own page world (manifest "world": "MAIN"), from document_start.
// It does three things and nothing else:
//   1. copies the caption files YouTube's player downloads for itself (/api/timedtext), so Twinsub never makes
//      its own caption requests (extra requests are what get other extensions' users rate-limited with 429s);
//   2. reports which caption track the player is showing, and turns captions on (in the spoken language) when asked;
//   3. runs Chrome's on-device Translator for the content script.
// Messages go both ways over window.postMessage, tagged with a source string.
(() => {
  if (window.__twinsubPage) return;
  window.__twinsubPage = true;

  const FROM_PAGE = "twinsub-page", FROM_CONTENT = "twinsub-content";
  const post = msg => window.postMessage({ source: FROM_PAGE, ...msg }, location.origin);
  const files = new Map();  // "<videoId>|<lang>|<kind>|<tlang>" -> { meta, body }

  function captured(url, body) {
    let u;
    try { u = new URL(url, location.href); } catch { return; }
    if (!u.pathname.endsWith("/api/timedtext") || !body) return;
    const meta = {
      videoId: u.searchParams.get("v") || "",
      lang: u.searchParams.get("lang") || "",
      kind: u.searchParams.get("kind") || "",
      tlang: u.searchParams.get("tlang") || "",
      fmt: u.searchParams.get("fmt") || "",
    };
    files.set([meta.videoId, meta.lang, meta.kind, meta.tlang].join("|"), { meta, body });
    post({ type: "captions", meta, body });
  }

  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__twinsubUrl = String(url);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__twinsubUrl && this.__twinsubUrl.includes("/api/timedtext")) {
      this.addEventListener("load", () => {
        if (this.status === 200 && (this.responseType === "" || this.responseType === "text")) captured(this.__twinsubUrl, this.responseText);
      });
    }
    return send.apply(this, arguments);
  };
  const fetch0 = window.fetch;
  window.fetch = function (input) {
    const url = typeof input === "string" ? input : input && input.url;
    const res = fetch0.apply(this, arguments);
    if (url && String(url).includes("/api/timedtext")) {
      res.then(r => r.ok ? r.clone().text() : null).then(t => captured(String(url), t)).catch(() => {});
    }
    return res;
  };

  const player = () => document.getElementById("movie_player");
  const videoId = () => new URLSearchParams(location.search).get("v") || "";

  function trackState() {
    const p = player();
    if (!p || typeof p.getOption !== "function") return { ready: false };
    let track = null, list = [];
    try { track = p.getOption("captions", "track"); } catch {}
    try { list = p.getOption("captions", "tracklist") || []; } catch {}
    const on = !!(track && track.languageCode);
    return {
      ready: true,
      videoId: videoId(),
      ad: p.classList.contains("ad-showing"),
      on,
      hasTracks: list.length > 0,
      lang: on ? track.languageCode : "",
      kind: on ? (track.kind || "") : "",
      tlang: on && track.translationLanguage ? track.translationLanguage.languageCode || "" : "",
      vssId: on ? track.vss_id || "" : "",
    };
  }

  // The track to turn on: the one in the language being spoken. YouTube's own toggle picks the viewer's last-used
  // language, or else the first track in the list, which is often someone's upload in another language (Arabic on
  // an English TEDx talk). The auto-generated track tells us the spoken language, even when the player's list
  // leaves it out because a hand-made track exists.
  function bestTrack(p) {
    let list = [], all = [];
    try { list = p.getOption("captions", "tracklist") || []; } catch {}
    try { all = p.getPlayerResponse().captions.playerCaptionsTracklistRenderer.captionTracks || []; } catch {}
    const base = l => (l || "").split("-")[0];
    const asr = all.find(t => t.kind === "asr") || list.find(t => t.kind === "asr");
    if (asr) {
      const spoken = asr.languageCode;
      return list.find(t => t.kind !== "asr" && t.languageCode === spoken)
        || list.find(t => t.kind !== "asr" && base(t.languageCode) === base(spoken))
        || list.find(t => t.kind === "asr")
        || { languageCode: spoken, kind: "asr" };
    }
    return list.find(t => t.is_default) || list.find(t => base(t.languageCode) === "en") || list[0] || null;
  }

  // Report track changes, including switches back to a track whose file was already downloaded
  // (the player reuses it without a new request).
  let last = "";
  setInterval(() => {
    const s = trackState();
    const key = JSON.stringify(s);
    if (key !== last) { last = key; post({ type: "track", state: s }); }
  }, 700);

  const translators = new Map();
  async function translator(src, tgt) {
    const key = src + ">" + tgt;
    if (!translators.has(key)) {
      translators.set(key, Translator.create({
        sourceLanguage: src, targetLanguage: tgt,
        monitor(m) { m.addEventListener("downloadprogress", e => post({ type: "download", src, tgt, loaded: e.loaded })); },
      }).catch(err => { translators.delete(key); throw err; }));
    }
    return translators.get(key);
  }

  window.addEventListener("message", async e => {
    if (e.source !== window || !e.data || e.data.source !== FROM_CONTENT) return;
    const d = e.data, reply = msg => post({ id: d.id, ...msg });
    try {
      if (d.type === "replay") {
        for (const f of files.values()) if (!d.videoId || f.meta.videoId === d.videoId) post({ type: "captions", ...f });
        post({ type: "track", state: trackState() });
      } else if (d.type === "captionsOn") {
        // Right after a page load the captions module may not be ready, and setting a track then does nothing,
        // so keep trying for a few seconds.
        for (let i = 0; i < 8 && !trackState().on; i++) {
          const p = player(), best = p && bestTrack(p);
          if (best) {
            try { p.loadModule("captions"); } catch {}
            try { p.setOption("captions", "track", best); } catch {}
          }
          await new Promise(r => setTimeout(r, 500));
        }
        reply({ type: "result", ok: trackState().on });
      } else if (d.type === "availability") {
        if (typeof Translator === "undefined") return reply({ type: "result", value: "no-api" });
        reply({ type: "result", value: await Translator.availability({ sourceLanguage: d.src, targetLanguage: d.tgt }) });
      } else if (d.type === "prepare") {
        await translator(d.src, d.tgt);
        reply({ type: "result", ok: true });
      } else if (d.type === "translate") {
        // A translator object can stop working while it sits in the cache (seen after Chrome downloaded a second
        // language pack), so on any failure build a fresh one and retry the failed lines once.
        let t = await translator(d.src, d.tgt);
        const out = await Promise.all(d.texts.map(s => t.translate(s).catch(() => null)));
        if (out.includes(null)) {
          translators.delete(d.src + ">" + d.tgt);
          t = await translator(d.src, d.tgt);
          await Promise.all(out.map((v, i) => v !== null ? null : t.translate(d.texts[i]).then(r => { out[i] = r; }, () => { out[i] = ""; })));
        }
        reply({ type: "result", value: out });
      }
    } catch (err) {
      reply({ type: "result", error: String(err && err.message || err) });
    }
  });
})();
