// Runs one explanation against the real API from Node, to judge wording and latency before deploying.
// Usage: ANTHROPIC_API_KEY=... NODE_USE_ENV_PROXY=1 node scripts/try.mjs [model] [effort] [target]
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM, buildRequest } from "../src/prompt.js";

const [model = "claude-opus-5-5", effort = "low", target = "zh-CN"] = process.argv.slice(2);
const built = buildRequest({
  video: { id: "x", title: "How we failed our way to a real startup", channel: "Founders Unfiltered" },
  kind: "", source: "en", target,
  lines: [
    { start: 243000, text: "Our first idea was a social network for pets." },
    { start: 247000, text: "It flopped. Like, nobody cared." },
    { start: 250000, text: "So we pivoted — honestly, we're basically the Uber for dog walking now." },
  ],
  focus: { line: 2, text: "the Uber for dog walking" },
});
const client = new Anthropic();
const t0 = Date.now(); let first = 0;
const params = { model, max_tokens: 4000, output_config: { effort }, system: SYSTEM, messages: [{ role: "user", content: built.user }] };
if (/^claude-(opus-5|fable-5|sonnet-5-5)/.test(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
const stream = client.beta.messages.stream(params);
for await (const e of stream) if (e.type === "content_block_delta" && e.delta.type === "text_delta") { if (!first) first = Date.now() - t0; process.stdout.write(e.delta.text); }
const m = await stream.finalMessage();
console.log(`\n--- ${model}/${effort}: first text ${first} ms, total ${Date.now() - t0} ms, in ${m.usage.input_tokens} out ${m.usage.output_tokens}, ${m.stop_reason}`);
