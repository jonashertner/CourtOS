// Model providers. The Anthropic provider sends exactly the body it is given
// (already guard-checked and stored) to the fixed Messages endpoint. No tools
// run on the provider side; no web search, code execution or file upload.
import Anthropic from "@anthropic-ai/sdk";
import { CourtosError } from "../util.mjs";

export const DEFAULT_MODEL = process.env.COURTOS_MODEL || "claude-opus-5-5";

export class AnthropicProvider {
  constructor(apiKey) {
    if (!apiKey) throw new CourtosError("api_key_missing");
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  }
  async create(body, { signal } = {}) {
    try {
      // Streaming keeps long outputs (a full claims table) within the
      // connection limits; only the final message is used.
      const headers = body.thinking?.display === "updates" ? { "anthropic-beta": "thinking-display-updates-2026-08-18" } : undefined;
      const stream = this.client.messages.stream(body, { signal, headers });
      return await stream.finalMessage();
    } catch (error) {
      if (signal?.aborted) throw new CourtosError("aborted");
      // Provider error bodies can echo request content; keep only the status.
      throw new CourtosError(error?.status ? `provider_${error.status}` : "provider_unreachable");
    }
  }
}

/** Replays a fixed list of assistant turns. Used by tests and the offline demo. */
export class ScriptedProvider {
  constructor(turns, { delayMs = 0 } = {}) {
    this.turns = turns;
    this.delayMs = delayMs;
    this.calls = [];
  }
  async create(body, { signal } = {}) {
    this.calls.push(structuredClone(body)); // snapshot: the loop keeps appending to messages
    if (this.delayMs) await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new CourtosError("aborted")); });
    });
    const turn = this.turns[this.calls.length - 1];
    if (!turn) throw new CourtosError("script_exhausted");
    const out = typeof turn === "function" ? turn(body) : turn;
    // A turn is a list of content blocks, or { content, stop_reason, stop_details }.
    const content = Array.isArray(out) ? out : out.content;
    const stop = Array.isArray(out) ? null : out;
    return { content, stop_reason: stop?.stop_reason ?? (content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn"), stop_details: stop?.stop_details ?? null, usage: { input_tokens: Math.round(JSON.stringify(body).length / 4), output_tokens: Math.round(JSON.stringify(content).length / 4) } };
  }
}

export const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });

// --- any model behind an OpenAI-compatible Chat Completions endpoint ---------
// OpenAI, Mistral, OpenRouter, Azure-style gateways, and local servers (Ollama,
// LM Studio, vLLM, llama.cpp). The runner speaks one request shape; this
// provider translates it and the reply. Only the guard-checked text of the body
// is carried over: no user ids, no stored completions, no provider-side tools.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** A release names one endpoint. Plain http only to this computer; never credentials in the URL. */
export function normaliseEndpoint(value) {
  let url;
  try { url = new URL(String(value ?? "").trim()); } catch { throw new CourtosError("invalid_endpoint"); }
  if (url.username || url.password || url.search || url.hash) throw new CourtosError("invalid_endpoint");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) throw new CourtosError("invalid_endpoint");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export const isLocalEndpoint = (endpoint) => LOOPBACK.has(new URL(endpoint).hostname);

const flatten = (content) => typeof content === "string" ? content : content.filter(b => b.type === "text").map(b => b.text).join("\n\n");

/** The runner's request (Messages shape) as a Chat Completions request. */
export function toChatCompletions(body, endpoint) {
  const messages = [{ role: "system", content: flatten(body.system) }];
  for (const m of body.messages) {
    if (typeof m.content === "string") { messages.push({ role: m.role, content: m.content }); continue; }
    if (m.role === "assistant") {
      const text = flatten(m.content);
      const calls = m.content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of m.content) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${b.content}` : b.content });
    const text = flatten(m.content);
    if (text) messages.push({ role: "user", content: text });
  }
  const openai = new URL(endpoint).hostname === "api.openai.com";
  return {
    model: body.model, messages,
    tools: body.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    tool_choice: "auto",
    // No output cap: models differ in what they accept, and a cap above a model's
    // limit is refused. The run's token limit still applies to the total.
    ...(openai ? { store: false } : {}),
  };
}

/** A Chat Completions reply in the shape the runner reads. */
export function fromChatCompletions(reply) {
  const choice = reply?.choices?.[0];
  if (!choice?.message) throw new CourtosError("provider_bad_reply");
  const content = [];
  if (typeof choice.message.content === "string" && choice.message.content.trim()) content.push({ type: "text", text: choice.message.content });
  for (const call of choice.message.tool_calls ?? []) {
    let input;
    // Arguments the model wrote as broken JSON reach submit_result as nothing and fail validation there.
    try { input = JSON.parse(call.function?.arguments || "{}"); } catch { input = {}; }
    content.push({ type: "tool_use", id: call.id || `call_${content.length}`, name: call.function?.name ?? "", input });
  }
  const stop = { tool_calls: "tool_use", length: "max_tokens", content_filter: "refusal" }[choice.finish_reason] ?? (content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn");
  const cached = reply.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    content, stop_reason: stop, stop_details: null,
    usage: { input_tokens: Math.max(0, (reply.usage?.prompt_tokens ?? 0) - cached), output_tokens: reply.usage?.completion_tokens ?? 0, cache_read_input_tokens: cached, cache_creation_input_tokens: 0 },
  };
}

export class OpenAICompatibleProvider {
  constructor({ endpoint, apiKey = null, fetchImpl = fetch }) {
    this.endpoint = normaliseEndpoint(endpoint);
    if (!apiKey && !isLocalEndpoint(this.endpoint)) throw new CourtosError("api_key_missing");
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }
  /** The request as it goes over the wire; the runner checks and stores this. */
  wire(body) { return toChatCompletions(body, this.endpoint); }
  async create(wire, { signal } = {}) {
    const timeout = AbortSignal.timeout(10 * 60 * 1000);
    let response;
    try {
      response = await this.fetch(`${this.endpoint}/chat/completions`, {
        method: "POST", signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: "error",
        headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(wire),
      });
    } catch {
      if (signal?.aborted) throw new CourtosError("aborted");
      throw new CourtosError("provider_unreachable");
    }
    // Error bodies can echo request content; keep only the status.
    if (!response.ok) throw new CourtosError(`provider_${response.status}`);
    return fromChatCompletions(await response.json().catch(() => null));
  }
}
