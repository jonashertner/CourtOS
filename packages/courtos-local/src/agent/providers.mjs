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
