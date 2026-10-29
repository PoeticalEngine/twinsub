// "Didn't catch that?" panel. A button next to the subtitles pauses the video and opens a panel with the last few
// lines: the translation on top, the original under it for reference. The viewer marks what they don't get in
// the translation (in the original only while there is no translation yet); tapping a mark (or "Explain whole
// line") asks api.poeticalengine.com through background.js. The model always gets the original lines; a mark in
// the translation only tells it where to look. The answer streams in under
// the line, in the viewer's language.
// content.js owns the cues and the overlay and hands them over through mount().
var TwinsubExplain = (() => {
  const SECTIONS = ["gist", "background", "language", "asr"];
  const SECTION_KEY = { gist: "secGist", background: "secBackground", language: "secLanguage", asr: "secAsr" };
  let api = null, askBtn = null, panel = null, view = null;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const LINES = 6;
  const stamp = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function mount(a) {
    api = a;
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && panel && !panel.hidden) { e.stopPropagation(); close(); return; }
      if (e.key !== "e" && e.key !== "E" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
      if (!api.cues().length) return;
      e.preventDefault(); e.stopPropagation();
      panel && !panel.hidden ? close() : open();
    }, true);
  }

  // Called from content.js whenever it (re)builds the overlay.
  function attach(overlay) {
    if (askBtn && overlay.contains(askBtn)) return;
    askBtn = el("button", "twinsub-ask", "?");
    askBtn.type = "button";
    askBtn.title = api.t("askTip", "E");
    askBtn.setAttribute("aria-label", api.t("panelTitle"));
    askBtn.addEventListener("click", e => { e.stopPropagation(); open(); });
    for (const ev of ["mousedown", "dblclick"]) askBtn.addEventListener(ev, e => e.stopPropagation());
    overlay.append(askBtn);
  }

  function context() {
    const video = api.video(), cues = api.cues();
    const t = (video ? video.currentTime : 0) * 1000;
    let i = TwinsubCaptions.cueAt(cues, t);
    if (i < 0) { i = -1; for (let k = 0; k < cues.length && cues[k].start <= t; k++) i = k; }
    return { i, cues };
  }

  function open() {
    const player = api.player(), video = api.video();
    if (!player || !api.cues().length) return;
    const { i, cues } = context();
    if (i < 0) return;
    if (!panel || !player.contains(panel)) build(player);
    const first = Math.max(0, i - LINES + 1);
    view = {
      videoKey: api.key(), wasPlaying: !!(video && !video.paused), active: null,
      lines: cues.slice(first, i + 1).map((c, k) => ({ index: first + k, cue: c, tr: api.translations()[first + k] || "", marks: [], whole: null })),
    };
    if (video && !video.paused) video.pause();
    panel.hidden = false;
    player.classList.add("twinsub-panel-open");
    panel.querySelector(".twinsub-panel-hint").textContent = api.t(view.lines.some(l => l.tr) ? "panelHint" : "panelHintNoTr");
    renderLines();
    setFooter(null);
    chrome.runtime.sendMessage({ type: "quota" }).then(q => { if (q && view) setFooter(q.remaining); }, () => {});
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    api.player()?.classList.remove("twinsub-panel-open");
    for (const line of view?.lines || []) for (const m of [...line.marks, line.whole]) m?.port?.disconnect();
    const video = api.video();
    if (view?.wasPlaying && video) video.play().catch(() => {});
    view = null;
  }

  // The player reacts to clicks and keys; nothing inside the panel should reach it.
  function shield(node) {
    for (const ev of ["mousedown", "click", "dblclick", "contextmenu", "wheel", "keydown", "keyup", "keypress", "touchstart"])
      node.addEventListener(ev, e => { if (!(ev === "keydown" && e.key === "Escape")) e.stopPropagation(); });
  }

  function build(player) {
    panel = el("div", "twinsub-panel");
    panel.hidden = true;
    shield(panel);
    const head = el("div", "twinsub-panel-head");
    const logo = el("span", "twinsub-panel-logo"); logo.append(el("i"), el("i"));
    const x = el("button", "twinsub-panel-close", "×"); x.type = "button"; x.title = api.t("close");
    x.addEventListener("click", close);
    head.append(logo, el("h3", "", api.t("panelTitle")), x);
    const hint = el("div", "twinsub-panel-hint", api.t("panelHint"));
    const body = el("div", "twinsub-panel-body");
    const foot = el("div", "twinsub-panel-foot");
    const whole = el("button", "twinsub-btn twinsub-btn-ghost", api.t("explainLine")); whole.type = "button";
    whole.addEventListener("click", () => { const line = view?.lines[view.lines.length - 1]; if (line) explainWhole(line); });
    foot.append(el("span", "twinsub-panel-quota"), el("span", "twinsub-sp"), whole);
    panel.append(head, hint, body, foot);
    body.addEventListener("mouseup", onSelect);
    player.append(panel);
  }

  function setFooter(remaining) {
    const q = panel.querySelector(".twinsub-panel-quota");
    q.textContent = remaining === null || remaining === undefined ? api.t("footerHint") : api.t("remaining", String(remaining));
  }

  function renderLines() {
    const body = panel.querySelector(".twinsub-panel-body");
    body.replaceChildren();
    view.lines.forEach((line, n) => {
      const row = el("div", "twinsub-pl" + (n === view.lines.length - 1 ? " twinsub-pl-cur" : ""));
      row.append(el("div", "twinsub-pl-time", stamp(line.cue.start) + (n === view.lines.length - 1 ? " · " + api.t("justNow") : "")));
      // The viewer's own language reads first; with no translation yet, the original is all there is.
      if (line.tr) row.append(textBlock(line, n, "tr", true));
      row.append(textBlock(line, n, "orig", !line.tr));
      const focus = line.marks.includes(view.active) ? view.active : (view.active === line.whole ? line.whole : null);
      if (focus) row.append(focus.answer ? answerBox(focus) : explainButton(line, focus));
      body.append(row);
    });
    scrollWithin(body.querySelector(".twinsub-ans, .twinsub-explain-btn"), "nearest");
  }

  function textBlock(line, n, side, primary) {
    const text = side === "tr" ? line.tr : line.cue.text;
    const block = el("div", "twinsub-pl-text" + (primary ? " twinsub-pl-main" : " twinsub-pl-sub"));
    block.lang = side === "tr" ? api.targetLang() : api.sourceLang();
    block.dataset.line = String(n);
    block.dataset.side = side;
    let at = 0;
    for (const m of line.marks.filter(m => m.side === side)) {
      if (m.s > at) block.append(document.createTextNode(text.slice(at, m.s)));
      const mk = el("mark", "twinsub-mark" + (view.active === m ? " twinsub-mark-on" : ""), text.slice(m.s, m.e));
      mk.addEventListener("click", () => { view.active = m; renderLines(); });
      block.append(mk);
      at = m.e;
    }
    if (at < text.length) block.append(document.createTextNode(text.slice(at)));
    return block;
  }

  // Scroll the panel body only; scrollIntoView would also scroll YouTube's page.
  function scrollWithin(node, how) {
    const body = panel.querySelector(".twinsub-panel-body");
    if (!node || !body) return;
    const top = node.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    if (how === "start") body.scrollTop = top;
    else if (top + node.offsetHeight > body.scrollTop + body.clientHeight) body.scrollTop = top + node.offsetHeight - body.clientHeight;
    else if (top < body.scrollTop) body.scrollTop = top;
  }

  function explainButton(line, mark) {
    const b = el("button", "twinsub-btn twinsub-explain-btn", "✦ " + api.t("explainThis")); b.type = "button";
    b.addEventListener("click", () => ask(line, mark));
    return b;
  }

  // Turn the viewer's selection into a mark on that line.
  function onSelect() {
    const sel = window.getSelection();
    if (!view || !sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const o = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest(".twinsub-pl-main");
    if (!o || !panel.contains(o)) return;
    const line = view.lines[Number(o.dataset.line)], side = o.dataset.side;
    const pre = document.createRange(); pre.setStart(o, 0); pre.setEnd(range.startContainer, range.startOffset);
    let s = pre.toString().length, e = s + range.toString().length;
    const text = side === "tr" ? line.tr : line.cue.text;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    sel.removeAllRanges();
    if (e <= s) return;
    // A new mark swallows any it overlaps.
    const keep = line.marks.filter(m => m.side !== side || m.e <= s || m.s >= e);
    for (const m of line.marks) if (!keep.includes(m)) { s = Math.min(s, m.s); e = Math.max(e, m.e); m.port?.disconnect(); }
    const mark = { side, s, e, text: text.slice(s, e), answer: null };
    line.marks = [...keep, mark].sort((a, b) => a.s - b.s);
    view.active = mark;
    renderLines();
  }

  function explainWhole(line) {
    if (!line.whole) line.whole = { side: "orig", s: 0, e: line.cue.text.length, text: "", answer: null, wholeLine: true };
    view.active = line.whole;
    if (!line.whole.answer) ask(line, line.whole); else renderLines();
  }

  function ask(line, mark) {
    if (mark.answer && mark.answer.status !== "error") return;
    const v = view;
    const cues = api.cues();
    const from = Math.max(0, line.index - LINES), to = Math.min(cues.length, line.index + 2);
    mark.answer = { status: "waiting", raw: "" };
    renderLines();
    const port = chrome.runtime.connect({ name: "twinsub-explain" });
    mark.port = port;
    port.onMessage.addListener(m => {
      if (view !== v) return;
      const a = mark.answer;
      if (m.type === "head") { if (m.remaining !== null) setFooter(m.remaining); }
      else if (m.type === "chunk") { a.firstChunk = !a.raw; a.status = "streaming"; a.raw += m.text; }
      else if (m.type === "done") { a.status = /(^|\n)@@error/.test(a.raw) ? "error" : "done"; port.disconnect(); }
      else if (m.type === "error") {
        a.status = "error";
        a.error = m.status === 429 ? "quota" : m.status === 503 ? "busy" : "failed";
        a.limit = m.limit;
        if (m.status === 429) setFooter(0);
        port.disconnect();
      }
      if (view.active === mark) updateAnswer(mark);
    });
    port.onDisconnect.addListener(() => { if (mark.answer?.status === "waiting" || mark.answer?.status === "streaming") { mark.answer.status = "error"; mark.answer.error = "failed"; if (view === v && view.active === mark) updateAnswer(mark); } });
    const meta = api.videoMeta();
    port.postMessage({
      video: meta, kind: api.track().kind || "", source: api.sourceLang(), target: api.targetLang(),
      lines: cues.slice(from, to).map(c => ({ start: c.start, text: c.text })),
      focus: { line: line.index - from, text: mark.wholeLine ? "" : mark.text, side: mark.side, translation: line.tr },
    });
  }

  function updateAnswer(mark) {
    const old = panel.querySelector(".twinsub-ans");
    if (old) old.replaceWith(answerBox(mark)); else renderLines();
    // Once the answer starts, bring its line to the top so the text has room to grow.
    if (mark.answer?.firstChunk) { mark.answer.firstChunk = false; scrollWithin(panel.querySelector(".twinsub-ans")?.closest(".twinsub-pl"), "start"); }
  }

  function parse(raw) {
    const out = [];
    let cur = null;
    for (const lineText of raw.split("\n")) {
      const m = lineText.match(/^\s*@@(\w+)\s*$/);
      if (m) { cur = { name: m[1], text: "" }; out.push(cur); continue; }
      if (!cur) { cur = { name: "gist", text: "" }; out.push(cur); }
      cur.text += (cur.text ? "\n" : "") + lineText;
    }
    // "Maybe misheard" only makes sense for auto-generated subtitles.
    const auto = api.track().kind === "asr";
    return out.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text && SECTIONS.includes(s.name) && (s.name !== "asr" || auto));
  }

  function answerBox(mark) {
    const a = mark.answer;
    const box = el("div", "twinsub-ans");
    box.lang = api.targetLang();
    if (a.status === "error") {
      if (a.error === "quota") {
        box.classList.add("twinsub-ans-quota");
        box.append(el("h5", "", api.t("quotaTitle", String(a.limit || 5))), el("p", "", api.t("quotaBody")));
        return box;
      }
      const sections = parse(a.raw);
      if (sections.length) appendSections(box, sections);
      box.append(el("p", "twinsub-ans-err", api.t(a.error === "busy" ? "errBusy" : "errFailed")));
      const retry = el("button", "twinsub-btn twinsub-btn-ghost", api.t("retry")); retry.type = "button";
      retry.addEventListener("click", () => { mark.answer = null; const line = view.lines.find(l => l.marks.includes(mark) || l.whole === mark); if (line) ask(line, mark); });
      box.append(retry);
      return box;
    }
    const sections = parse(a.raw);
    if (!sections.length) { box.append(el("p", "twinsub-ans-wait", api.t("thinking"))); return box; }
    appendSections(box, sections);
    if (a.status === "streaming") box.lastChild.append(el("span", "twinsub-caret"));
    if (a.status === "done") box.append(el("div", "twinsub-ans-note", api.t("aiNote")));
    return box;
  }

  function appendSections(box, sections) {
    if (sections.some(s => s.name !== "gist") || sections.length > 1) {
      for (const s of sections) box.append(el("h4", "", api.t(SECTION_KEY[s.name])), el("p", "", s.text));
    } else box.append(el("p", "", sections[0].text));
  }

  // content.js calls this on every refresh; a different video or track closes the panel.
  function sync() { if (view && api.key() !== view.videoKey) close(); }

  return { mount, attach, close, sync };
})();
