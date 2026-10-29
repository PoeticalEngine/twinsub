import test from "node:test";
import assert from "node:assert";
import { buildRequest } from "../../src/prompt.js";

const base = { video: { id: "v", title: "T", channel: "C" }, kind: "asr", source: "en", target: "zh-CN",
  lines: [{ start: 1000, text: "It flopped." }, { start: 4000, text: "So we pivoted." }], focus: { line: 1, text: "pivoted" } };

test("marks the focus line and the marked words", () => {
  const r = buildRequest(base);
  assert.match(r.user, /\[0:04\] So we pivoted\.   ← the viewer paused/);
  assert.match(r.user, /The viewer marked: "pivoted"/);
  assert.match(r.user, /auto-generated/);
  assert.match(r.user, /^Answer language: Chinese \(China\)\.[\s\S]*Write the whole answer in Chinese/);
});

test("whole line when nothing is marked", () => {
  assert.match(buildRequest({ ...base, focus: { line: 1, text: "" } }).user, /marked the whole line at 0:04/);
});

test("rejects marks that aren't in the line, and empty input", () => {
  assert.strictEqual(buildRequest({ ...base, focus: { line: 1, text: "flopped" } }).error, "focus not in line");
  assert.strictEqual(buildRequest({ ...base, lines: [] }).error, "no lines");
  assert.strictEqual(buildRequest(null).error, "bad request");
});

test("same question, same cache key; a different target language is a different key", () => {
  assert.strictEqual(buildRequest(base).cacheKey, buildRequest({ ...base, lines: [base.lines[1]], focus: { line: 0, text: "pivoted" } }).cacheKey);
  assert.notStrictEqual(buildRequest(base).cacheKey, buildRequest({ ...base, target: "ja" }).cacheKey);
});

test("a mark in the translation sends the original lines plus where to look", () => {
  const r = buildRequest({ ...base, focus: { line: 1, side: "tr", text: "转向", translation: "所以我们转向了。" } });
  assert.match(r.user, /\[0:04\] So we pivoted\./);
  assert.match(r.user, /machine translation of the line at 0:04: "所以我们转向了。"/);
  assert.match(r.user, /they marked: "转向"/);
  assert.strictEqual(buildRequest({ ...base, focus: { line: 1, side: "tr", text: "转向", translation: "别的" } }).error, "focus not in line");
  assert.notStrictEqual(r.cacheKey, buildRequest({ ...base, focus: { line: 1, text: "pivoted" } }).cacheKey);
});

test("long context keeps the focus on the right line", () => {
  const lines = Array.from({ length: 12 }, (_, k) => ({ start: k * 1000, text: "line " + k }));
  const r = buildRequest({ ...base, lines, focus: { line: 10, text: "line 10" } });
  assert.match(r.user, /\[0:10\] line 10   ← the viewer paused/);
  assert.doesNotMatch(r.user, /line 1\b(?!\d)/);
});
