// npm test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../src/captions.js");

// Real caption files from YouTube aren't checked in (they're someone else's text); drop them into test/fixtures to run those tests.
const fixturePath = name => path.join(__dirname, "fixtures", name);
const fixture = name => fs.readFileSync(fixturePath(name), "utf8");
const needs = name => ({ skip: !fs.existsSync(fixturePath(name)) && "no fixtures/" + name });
const wellFormed = cues => {
  assert.ok(cues.length > 0);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].text && cues[i].text === cues[i].text.trim(), "trimmed text at " + i);
    assert.ok(!/\n/.test(cues[i].text), "no newlines at " + i);
    assert.ok(cues[i].end > cues[i].start, "positive length at " + i);
    if (i) assert.ok(cues[i].start >= cues[i - 1].end, "no overlap at " + i);
  }
};

test("hand-made captions (TED, French) keep YouTube's lines", needs("fr-manual.json"), () => {
  const cues = C.parse(fixture("fr-manual.json"), "");
  wellFormed(cues);
  assert.ok(cues.length > 100);
});

test("auto-generated captions in two-line windows become one cue per window", needs("en-asr.json"), () => {
  const cues = C.parse(fixture("en-asr.json"), "asr");
  wellFormed(cues);
  const c = cues.find(x => x.text.includes("90 pages"));
  assert.match(c.text, /^and so I did the only thing I could I wrote 90 pages/);
});

test("word-timed auto captions regroup into sentences", () => {
  const words = [" So", " today", " we", " talk", " about", " learning.", " It's", " fun"];
  const ev = { events: [{ tStartMs: 1000, dDurationMs: 4000, wWinId: 1, segs: words.map((w, i) => ({ utf8: w, tOffsetMs: i * 300 })) }, { tStartMs: 3000, aAppend: 1, segs: [{ utf8: "\n" }] }] };
  const cues = C.parse(JSON.stringify(ev), "asr");
  assert.deepStrictEqual(cues.map(c => c.text), ["So today we talk about learning.", "It's fun"]);
  wellFormed(cues);
});

test("a long pause splits a cue; unspaced languages count characters", () => {
  const ev = { events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "今日は" }, { utf8: "いい", tOffsetMs: 300 }, { utf8: "天気", tOffsetMs: 600 }] },
    { tStartMs: 5000, dDurationMs: 2000, segs: [{ utf8: "ですね" }] },
  ] };
  assert.deepStrictEqual(C.parse(JSON.stringify(ev), "asr").map(c => c.text), ["今日はいい天気", "ですね"]);
});

test("junk input gives no cues", () => {
  assert.deepStrictEqual(C.parse("not json", ""), []);
  assert.deepStrictEqual(C.parse("{}", "asr"), []);
});

test("language codes map onto Translator codes", () => {
  assert.strictEqual(C.translatorLang("zh-CN"), "zh");
  assert.strictEqual(C.translatorLang("zh-Hans"), "zh");
  assert.strictEqual(C.translatorLang("zh-TW"), "zh-Hant");
  assert.strictEqual(C.translatorLang("zh-HK"), "zh-Hant");
  assert.strictEqual(C.translatorLang("en-US"), "en");
  assert.strictEqual(C.translatorLang("pt-BR"), "pt");
  assert.strictEqual(C.translatorLang("iw"), "he");
  assert.strictEqual(C.translatorLang("nb"), "no");
  assert.strictEqual(C.translatorLang("fil"), "");
  assert.strictEqual(C.translatorLang("km"), "");
  assert.strictEqual(C.translatorLang(""), "");
});

test("cueAt finds the cue on screen", () => {
  const cues = [{ start: 0, end: 1000 }, { start: 1500, end: 2000 }];
  assert.strictEqual(C.cueAt(cues, 500), 0);
  assert.strictEqual(C.cueAt(cues, 1200), -1);
  assert.strictEqual(C.cueAt(cues, 1500), 1);
  assert.strictEqual(C.cueAt(cues, 2000), -1);
  assert.strictEqual(C.cueAt([], 0), -1);
});
