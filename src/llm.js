// Calls the viewer's own AI provider straight from the extension (bring your own key). Three wire formats cover the
// providers people use: OpenAI-compatible Chat Completions, OpenAI's Responses API, and Anthropic's Messages API.
// Presets only fill in a base URL and format; every field stays editable.

export const FORMATS = ["chat", "responses", "anthropic"];

// keyless: no API key needed (local servers). models: suggestions shown before the provider's own list is loaded.
export const PRESETS = [
  { id: "openai", name: "OpenAI", format: "responses", base: "https://api.openai.com/v1", keys: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic (Claude)", format: "anthropic", base: "https://api.anthropic.com", model: "claude-haiku-5-5", keys: "https://console.anthropic.com/settings/keys" },
  { id: "gemini", name: "Google Gemini", format: "chat", base: "https://generativelanguage.googleapis.com/v1beta/openai", keys: "https://aistudio.google.com/apikey" },
  { id: "openrouter", name: "OpenRouter", format: "chat", base: "https://openrouter.ai/api/v1", keys: "https://openrouter.ai/keys" },
  { id: "deepseek", name: "DeepSeek", format: "chat", base: "https://api.deepseek.com/v1", model: "deepseek-chat", keys: "https://platform.deepseek.com/api_keys" },
  { id: "xai", name: "xAI (Grok)", format: "chat", base: "https://api.x.ai/v1", keys: "https://console.x.ai" },
  { id: "mistral", name: "Mistral", format: "chat", base: "https://api.mistral.ai/v1", keys: "https://console.mistral.ai/api-keys" },
  { id: "groq", name: "Groq", format: "chat", base: "https://api.groq.com/openai/v1", keys: "https://console.groq.com/keys" },
  { id: "qwen", name: "Alibaba Cloud Qwen (DashScope)", format: "chat", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", alt: ["https://dashscope-intl.aliyuncs.com/compatible-mode/v1"], keys: "https://bailian.console.aliyun.com" },
  { id: "moonshot", name: "Moonshot AI (Kimi)", format: "chat", base: "https://api.moonshot.cn/v1", alt: ["https://api.moonshot.ai/v1"], keys: "https://platform.moonshot.cn/console/api-keys" },
  { id: "zhipu", name: "Zhipu GLM (BigModel)", format: "chat", base: "https://open.bigmodel.cn/api/paas/v4", alt: ["https://api.z.ai/api/paas/v4"], keys: "https://open.bigmodel.cn/usercenter/apikeys" },
  { id: "volcengine", name: "Volcengine Ark (Doubao)", format: "chat", base: "https://ark.cn-beijing.volces.com/api/v3", keys: "https://console.volcengine.com/ark" },
  { id: "siliconflow", name: "SiliconFlow", format: "chat", base: "https://api.siliconflow.cn/v1", alt: ["https://api.siliconflow.com/v1"], keys: "https://cloud.siliconflow.cn/account/ak" },
  { id: "ollama", name: "Ollama (local)", format: "chat", base: "http://localhost:11434/v1", keyless: true },
  { id: "custom-chat", name: "OpenAI-compatible (Chat Completions)", format: "chat", base: "", custom: true },
  { id: "custom-responses", name: "OpenAI Responses API", format: "responses", base: "", custom: true },
  { id: "custom-anthropic", name: "Claude Messages API", format: "anthropic", base: "", custom: true },
];
export const preset = id => PRESETS.find(p => p.id === id) || PRESETS.find(p => p.id === "custom-chat");

const trim = base => String(base || "").trim().replace(/\/+$/, "");
// Anthropic-style bases are given with or without the /v1 the paths need.
const anthropicUrl = (base, path) => trim(base).replace(/\/v1$/, "") + "/v1" + path;

export function originOf(base) {
  try { const u = new URL(trim(base)); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch { return ""; }
}

function request(cfg, system, user) {
  const { format, baseUrl, apiKey, model } = cfg;
  if (format === "anthropic") {
    const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
    if (apiKey) headers["x-api-key"] = apiKey;
    return [anthropicUrl(baseUrl, "/messages"), headers, { model, max_tokens: 2000, stream: true, system, messages: [{ role: "user", content: user }] }];
  }
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = "Bearer " + apiKey;
  if (format === "responses") return [trim(baseUrl) + "/responses", headers, { model, stream: true, instructions: system, input: user }];
  return [trim(baseUrl) + "/chat/completions", headers, { model, stream: true, messages: [{ role: "system", content: system }, { role: "user", content: user }] }];
}

// The text in one server-sent event, or "" for events that carry none. Throws on an error event.
function textOf(format, data) {
  if (data.error) throw new ProviderError(0, data.error.message || data.error.type || String(data.error));
  if (format === "anthropic") return data.type === "content_block_delta" && data.delta?.type === "text_delta" ? data.delta.text : "";
  if (format === "responses") {
    if (data.type === "response.failed" || data.type === "response.incomplete") throw new ProviderError(0, data.response?.error?.message || data.type);
    return data.type === "response.output_text.delta" ? data.delta || "" : "";
  }
  return data.choices?.[0]?.delta?.content || "";
}

export class ProviderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function fail(res) {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try { const j = JSON.parse(text); message = j.error?.message || j.message || j.error || message; } catch {}
  return new ProviderError(res.status, String(message || res.statusText));
}

// Yields the answer's text as it streams in.
export async function* stream(cfg, system, user, signal) {
  const [url, headers, body] = request(cfg, system, user);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw await fail(res);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // Events are separated by a blank line; only their data: lines matter here.
    let cut;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const event = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = event.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      const text = textOf(cfg.format, parsed);
      if (text) yield text;
    }
  }
}

// The provider's model ids, for the settings page.
export async function listModels(cfg, signal) {
  const { format, baseUrl, apiKey } = cfg;
  const headers = format === "anthropic"
    ? { "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", ...(apiKey ? { "x-api-key": apiKey } : {}) }
    : apiKey ? { Authorization: "Bearer " + apiKey } : {};
  const url = format === "anthropic" ? anthropicUrl(baseUrl, "/models?limit=1000") : trim(baseUrl) + "/models";
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw await fail(res);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.data || body.models || [];
  return [...new Set(list.map(m => typeof m === "string" ? m : m.id || m.name).filter(Boolean).map(String))].sort();
}
