// Pure helpers shared by the content script and the tests: turning YouTube's json3 caption files into cues,
// and mapping YouTube language codes onto the codes Chrome's Translator accepts.
// Loaded as a classic content script before content.js, so everything hangs off one global.
var TwinsubCaptions = (() => {
  // The language codes Chrome's Translator API lists (developer.chrome.com/docs/ai/translator-api, 2026-10).
  const SUPPORTED = ["ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "hr", "hu", "id", "it",
    "ja", "kn", "ko", "lt", "mr", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "ta", "te", "th", "tr", "uk", "vi",
    "zh", "zh-Hant"];

  // YouTube or browser language code -> Translator code, or "" when the Translator can't handle it.
  function translatorLang(code) {
    if (!code) return "";
    const c = code.replace("_", "-").toLowerCase();
    if (c === "zh-tw" || c === "zh-hk" || c === "zh-mo" || c === "zh-hant") return "zh-Hant";
    if (c.startsWith("zh")) return "zh";
    const base = c.split("-")[0];
    const mapped = { iw: "he", nb: "no", nn: "no", fil: "", tl: "" }[base];
    const out = mapped !== undefined ? mapped : base;
    return SUPPORTED.includes(out) ? out : "";
  }

  const clean = s => s.replace(/\s+/g, " ").trim();
  const ENDS_SENTENCE = /[.!?。！？…]["')\]」』]?$/;

  // json3 -> [{ start, end, text }] in milliseconds, sorted, non-overlapping.
  // Hand-made captions already come in readable lines. Auto-generated (ASR) ones arrive as a rolling window of
  // words, so those are regrouped into sentence-sized cues: a translation of half a sentence is mostly noise.
  function parse(body, kind) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { return []; }
    const events = (data && data.events) || [];
    // Some auto-generated files carry word timings (tOffsetMs); others come as ready-made two-line blocks,
    // which read best shown the way YouTube shows them.
    const wordTimed = events.some(e => e.segs && e.segs.some(s => s.tOffsetMs !== undefined));
    return kind === "asr" && wordTimed ? parseAsr(events) : parseLines(events);
  }

  function parseLines(events) {
    const cues = [];
    for (const e of events) {
      if (!e.segs) continue;
      const text = clean(e.segs.map(s => s.utf8 || "").join(""));
      if (!text) continue;
      const start = e.tStartMs || 0, end = start + (e.dDurationMs || 0);
      const prev = cues[cues.length - 1];
      // Some uploads repeat a line across consecutive events; keep one.
      if (prev && prev.text === text && start <= prev.end + 50) { prev.end = Math.max(prev.end, end); continue; }
      cues.push({ start, end, text });
    }
    cues.sort((a, b) => a.start - b.start);
    for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
    return cues;
  }

  function parseAsr(events) {
    const words = [];
    for (const e of events) {
      if (!e.segs || e.aAppend) continue;
      for (const s of e.segs) {
        const w = (s.utf8 || "").replace(/\n/g, " ");
        if (!w.trim()) continue;
        words.push({ t: (e.tStartMs || 0) + (s.tOffsetMs || 0), w, endHint: (e.tStartMs || 0) + (e.dDurationMs || 0) });
      }
    }
    // A language written without spaces (ja, zh, th) has tokens without leading spaces.
    const spaced = words.filter(x => /^\s/.test(x.w)).length > words.length / 4;
    const maxUnits = spaced ? 16 : 28;
    const cues = [];
    let cur = null;
    const flush = until => {
      if (!cur) return;
      cur.end = Math.min(until, cur.last + 2500);
      cur.text = clean(cur.text);
      if (cur.text) cues.push({ start: cur.start, end: cur.end, text: cur.text });
      cur = null;
    };
    words.forEach((x, i) => {
      if (cur && x.t - cur.last > 1200) flush(x.t);
      if (!cur) cur = { start: x.t, last: x.t, text: "", units: 0 };
      cur.text += cur.units === 0 ? x.w.trimStart() : x.w;
      cur.last = x.t;
      cur.units += spaced ? 1 : x.w.trim().length;
      const next = words[i + 1];
      const enough = cur.units >= maxUnits || (ENDS_SENTENCE.test(x.w.trim()) && cur.units >= (spaced ? 4 : 8));
      if (enough || !next) flush(next ? next.t : Math.max(x.endHint, x.t + 1500));
    });
    return cues;
  }

  // Index of the cue showing at time t (ms), or -1.
  function cueAt(cues, t) {
    let lo = 0, hi = cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].end <= t) lo = mid + 1;
      else if (cues[mid].start > t) hi = mid - 1;
      else return mid;
    }
    return -1;
  }

  // Index of the cue showing at time t, or else the next one to come (the last one after the end).
  function anchorAt(cues, t) {
    const i = cueAt(cues, t);
    if (i >= 0 || !cues.length) return i;
    const next = cues.findIndex(c => c.start > t);
    return next >= 0 ? next : cues.length - 1;
  }

  // Lines are translated many at a time as one text, so the Translator sees the conversation around each line
  // ("speakers" becomes 演讲者 rather than 扬声器). Each line is numbered "[1] … [2] …" and split back on the
  // numbers. A 7-minute talk (275 lines) takes about a second; into Chinese every number came back, into
  // Japanese 24 went missing where it merged half-sentences, so lines are accepted one by one, not all or none.

  // Ranges of up to `size` lines covering 0..n, the first one starting just before line `from`, then onward,
  // then back towards the start.
  function chunks(n, from, size = 200) {
    const first = Math.max(0, Math.min(from - 10, n - size));
    const out = [];
    for (let s = first; s < n; s += size) out.push({ start: s, end: Math.min(n, s + size) });
    for (let e = first; e > 0; e -= size) out.push({ start: Math.max(0, e - size), end: e });
    return out;
  }

  // Indices -> runs of consecutive indices.
  function runs(indices) {
    const out = [];
    for (const k of [...indices].sort((a, b) => a - b)) {
      const r = out[out.length - 1];
      if (r && k === r[r.length - 1] + 1) r.push(k); else out.push([k]);
    }
    return out;
  }

  const joinNumbered = lines => lines.length === 1 ? lines[0] : lines.map((s, i) => `[${i + 1}] ${s}`).join(" ");

  // A translated numbered text -> its n lines, with null for each line that didn't come back cleanly: its number
  // missing, out of order or repeated, or nothing but punctuation left after it ("安全 [271]。" means 271 was
  // merged into 270). A line next to a broken one may hold part of its text, so it counts as broken too.
  function splitNumbered(text, n) {
    const s = String(text || "");
    if (n === 1) return [/[\p{L}\p{N}]/u.test(s) ? s.trim() : null];
    const parts = s.split(/\s*\[(\d+)\]\s*/);
    const found = [];
    for (let i = 1; i < parts.length; i += 2) found.push({ k: +parts[i], body: parts[i + 1] });
    const out = new Array(n).fill(null), count = new Array(n).fill(0), junk = new Array(n).fill(false);
    found.forEach(({ k }) => { if (k >= 1 && k <= n) count[k - 1]++; });
    found.forEach(({ k, body }, j) => {
      if (!(k >= 1 && k <= n)) return;
      if (count[k - 1] > 1) { junk[k - 1] = true; return; }
      const prev = found[j - 1], next = found[j + 1];
      const inPlace = (prev ? prev.k === k - 1 : k === 1 && !parts[0].trim()) && (next ? next.k === k + 1 : k === n);
      // The Translator sometimes moves the comma ending a line past the next number: "[2]、そして…".
      const line = body.replace(/^[、，,]/, "").trim();
      if (!inPlace) return;
      if (/[\p{L}\p{N}]/u.test(line)) out[k - 1] = line; else junk[k - 1] = true;
    });
    // Lines around a missing or misplaced number already fail the order check; a number that came back twice or
    // with only punctuation after it takes its neighbours with it.
    return out.map((v, i) => junk[i - 1] || junk[i + 1] ? null : v);
  }

  return { SUPPORTED, translatorLang, parse, cueAt, anchorAt, chunks, runs, joinNumbered, splitNumbered };
})();
if (typeof module !== "undefined") module.exports = TwinsubCaptions;
