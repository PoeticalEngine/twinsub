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

test("chunks start just before the viewer, then go on, then back", () => {
  assert.deepStrictEqual(C.chunks(275, 0), [{ start: 0, end: 200 }, { start: 200, end: 275 }]);
  assert.deepStrictEqual(C.chunks(275, 110), [{ start: 75, end: 275 }, { start: 0, end: 75 }]);
  assert.deepStrictEqual(C.chunks(900, 450), [{ start: 440, end: 640 }, { start: 640, end: 840 }, { start: 840, end: 900 }, { start: 240, end: 440 }, { start: 40, end: 240 }, { start: 0, end: 40 }]);
  assert.deepStrictEqual(C.chunks(30, 5), [{ start: 0, end: 30 }]);
  assert.deepStrictEqual(C.chunks(0, 0), []);
});

test("broken lines group into runs", () => {
  assert.deepStrictEqual(C.runs([9, 3, 4, 5, 12]), [[3, 4, 5], [9], [12]]);
  assert.deepStrictEqual(C.runs([]), []);
});

test("the anchor is the line on screen, or else the next one", () => {
  const cues = [{ start: 0, end: 1000 }, { start: 2000, end: 3000 }];
  assert.strictEqual(C.anchorAt(cues, 500), 0);
  assert.strictEqual(C.anchorAt(cues, 1500), 1);
  assert.strictEqual(C.anchorAt(cues, 9000), 1);
  assert.strictEqual(C.anchorAt([], 0), -1);
});

test("numbered text splits back into its lines", () => {
  const lines = ["I’ve coached thousands of speakers all over the world,", "from big tech companies to small startups,"];
  assert.strictEqual(C.joinNumbered(lines), "[1] I’ve coached thousands of speakers all over the world, [2] from big tech companies to small startups,");
  assert.strictEqual(C.joinNumbered(["Hi."]), "Hi.");
  assert.deepStrictEqual(C.splitNumbered("[1] 我在世界各地指导过数千名演讲者，[2] 从大型科技公司到小型初创公司，", 2),
    ["我在世界各地指导过数千名演讲者，", "从大型科技公司到小型初创公司，"]);
  assert.deepStrictEqual(C.splitNumbered("[1] その旅のキャプテンである [2]、そして重要です。", 2), ["その旅のキャプテンである", "そして重要です。"]);
  assert.deepStrictEqual(C.splitNumbered("你好。", 1), ["你好。"]);
  assert.deepStrictEqual(C.splitNumbered("[1] (笑) [2] 好。", 2), ["(笑)", "好。"]);
});

test("lines that didn't come back cleanly are null, with their neighbours, the rest kept", () => {
  const n = 7, ok = i => `[${i}] 第${i}句。`;
  const text = (...middle) => [ok(1), ok(2), ...middle, ok(6), ok(7)].join(" ");
  // A dropped number: 3 and 5 may hold 4's text.
  assert.deepStrictEqual(C.splitNumbered(text(ok(3), ok(5)), n), ["第1句。", "第2句。", null, null, null, "第6句。", "第7句。"]);
  // Only punctuation left after a number (real output: "让您的观众感到安全 [271]。 [272]").
  assert.deepStrictEqual(C.splitNumbered(text("[3] 安全", "[4]。", ok(5)), n), ["第1句。", "第2句。", null, null, null, "第6句。", "第7句。"]);
  // Out of order, repeated, mangled ("2]") or text before [1].
  assert.deepStrictEqual(C.splitNumbered(text(ok(4), ok(3), ok(5)), n).map(Boolean), [true, false, false, false, false, true, true]);
  assert.deepStrictEqual(C.splitNumbered(text(ok(3), ok(3), ok(4), ok(5)), n).map(Boolean), [true, false, false, false, true, true, true]);
  assert.deepStrictEqual(C.splitNumbered("[1] 我将成为船长。2]让我们旅途愉快。 [3] 关键是", 3), [null, null, null]);
  assert.deepStrictEqual(C.splitNumbered("好 [1] a [2] b [3] c", 3), [null, "b", "c"]);
  assert.deepStrictEqual(C.splitNumbered("", 3), [null, null, null]);
  assert.deepStrictEqual(C.splitNumbered(null, 1), [null]);
});
