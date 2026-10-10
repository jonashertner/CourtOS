import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Declaring the stub's parameter (rather than a zero-arity `vi.fn`) is what
// lets tsc check the `mock.calls[0][0]` lookup below; with an empty call tuple
// every assertion on it type-checks vacuously.
type StreamChatCall = {
  systemPrompt: string;
  messages: { role: string; content: string; reasoning?: string }[];
  [key: string]: unknown;
};

const { streamChatWithTools } = vi.hoisted(() => ({
  streamChatWithTools: vi.fn(async (_params: StreamChatCall) => ({
    fullText: "",
  })),
}));

vi.mock("../../../../lib/llm", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../../../../lib/llm/models")),
  streamChatWithTools: (params: StreamChatCall) => streamChatWithTools(params),
}));
vi.mock("../../../../lib/mcpConnectors", () => ({
  buildUserMcpTools: vi.fn(async () => []),
}));
vi.mock("../tools/toolDispatcher", () => ({
  runToolCalls: vi.fn(),
}));

import { runLLMStream, assistantStreamErrorPayload } from "../streaming";

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  streamChatWithTools.mockReset();
  streamChatWithTools.mockResolvedValue({ fullText: "" });
});

describe("runLLMStream history", () => {
  it("drops assistant turns that carry no text so no provider sees an empty block", async () => {
    // A cancelled or errored turn, or a client that keeps prose in events,
    // replays as content "". Anthropic rejects the whole request over one
    // such block ("text content blocks must be non-empty").
    await runLLMStream({
      model: "gemini-3.8-flash",
      apiMessages: [
        { role: "system", content: "SYSTEM" },
        { role: "user", content: "first" },
        { role: "assistant", content: "" },
        { role: "user", content: "second" },
        { role: "assistant", content: "kept" },
        { role: "user", content: "third" },
      ],
      docStore: new Map(),
      docIndex: {},
      userId: "u1",
      db: {} as never,
      write: vi.fn(),
    });
    const params = streamChatWithTools.mock.calls[0]![0];
    expect(params.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "first"],
      ["user", "second"],
      ["assistant", "kept"],
      ["user", "third"],
    ]);
  });

  it("carries attached reasoning on assistant turns through to the model call", async () => {
    await runLLMStream({
      model: "gemini-3.8-flash",
      apiMessages: [
        { role: "system", content: "SYSTEM" },
        { role: "user", content: "first" },
        { role: "assistant", content: "answer", reasoning: "why" },
        { role: "user", content: "second" },
      ],
      docStore: new Map(),
      docIndex: {},
      userId: "u1",
      db: {} as never,
      write: vi.fn(),
    });
    const params = streamChatWithTools.mock.calls[0]![0];
    expect(params.messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "answer", reasoning: "why" },
      { role: "user", content: "second" },
    ]);
  });
});

type ReasoningCallbacks = {
  onReasoningDelta: (delta: string) => void;
  onReasoningBlockEnd: () => void;
  onContentDelta: (delta: string) => void;
};

const streamArgs = () => ({
  model: "gemini-3.8-flash",
  apiMessages: [
    { role: "system", content: "SYSTEM" },
    { role: "user", content: "question" },
  ],
  docStore: new Map(),
  docIndex: {},
  userId: "u1",
  db: {} as never,
  write: vi.fn(),
});

describe("runLLMStream reasoning persistence", () => {
  it("stores completed reasoning without model metadata", async () => {
    streamChatWithTools.mockImplementationOnce(async (params) => {
      const callbacks = params.callbacks as ReasoningCallbacks;
      callbacks.onReasoningDelta("Thinking.");
      callbacks.onReasoningBlockEnd();
      callbacks.onContentDelta("Answer.");
      return { fullText: "Answer." };
    });

    const { events } = await runLLMStream(streamArgs());

    expect(events).toContainEqual({
      type: "reasoning",
      text: "Thinking.",
    });
  });

  it("stores reasoning flushed from a failed turn without model metadata", async () => {
    streamChatWithTools.mockImplementationOnce(async (params) => {
      (params.callbacks as ReasoningCallbacks).onReasoningDelta("Half a thought");
      throw new Error("upstream dropped");
    });

    const failure = await runLLMStream(streamArgs()).catch((e: unknown) => e);

    expect((failure as { events?: unknown[] }).events).toContainEqual({
      type: "reasoning",
      text: "Half a thought",
    });
  });
});


describe("CourtOS incomplete output is not a completed answer", () => {
  it("keeps the token-limit warning visible even inside an unfinished citation block", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    const partial = 'A fact [1].<CITATIONS>[{"ref":1,"doc_id":"doc-0","quotes":[';
    streamChatWithTools.mockImplementationOnce(async (params) => {
      (params.callbacks as ReasoningCallbacks).onContentDelta(partial);
      return { fullText: partial, finishReason: "length", stopReason: "output_limit" };
    });
    const args = { ...streamArgs(), model: "courtos-local" };
    const failure = await runLLMStream(args).catch((e: unknown) => e);
    expect((failure as { events: unknown[] }).events).toContainEqual({ type: "content", text: "A fact [1]." });
    expect((failure as { events: unknown[] }).events).toContainEqual(expect.objectContaining({ type: "error", safe_to_display: true, message: expect.stringContaining("Tokenlimit") }));
    const frames = args.write.mock.calls.map((call) => String(call[0])).join("");
    // Routes emit this payload independently of the hidden citation stream
    // and persist the error event above, so it survives a page reload.
    expect(assistantStreamErrorPayload(failure)).toMatchObject({ safe_to_display: true, message: expect.stringContaining("Tokenlimit") });
    expect(frames).not.toContain("[DONE]");
  });

  it("rejects unlinked reference numbers even when the provider reports a normal stop", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    streamChatWithTools.mockImplementationOnce(async (params) => {
      (params.callbacks as ReasoningCallbacks).onContentDelta("A fact [1].");
      return { fullText: "A fact [1].", finishReason: "stop" };
    });
    const failure = await runLLMStream({ ...streamArgs(), model: "courtos-local" }).catch((e: unknown) => e);
    expect((failure as { events: unknown[] }).events).toContainEqual(expect.objectContaining({ type: "error", safe_to_display: true, message: expect.stringContaining("Quellenverweise") }));
  });

  it("rejects an inline source without an immutable PDF version before inference", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    const args = { ...streamArgs(), model: "courtos-local", docStore: new Map([["doc-0", { storage_path: "", file_type: "txt", filename: "demo.txt", inline_text: "Eingang am Montag" }]]), docIndex: { "doc-0": { document_id: "synthetic-document", filename: "demo.txt" } } };
    const failure = await runLLMStream(args).catch((error: unknown) => error);
    expect(assistantStreamErrorPayload(failure)).toMatchObject({ code: "source_grounding_failed", safe_to_display: true });
    expect(streamChatWithTools).not.toHaveBeenCalled();
    expect(args.write.mock.calls.map((call) => String(call[0])).join("")).not.toContain('"status":"final"');
  });

  it("marks an exhausted tool budget as incomplete", async () => {
    vi.stubEnv("COURTOS_PILOT_MODE", "true");
    streamChatWithTools.mockImplementationOnce(async () => ({ fullText: "", finishReason: "tool-calls", stopReason: "step_limit" }));
    const failure = await runLLMStream({ ...streamArgs(), model: "courtos-local" }).catch((e: unknown) => e);
    expect((failure as { events: unknown[] }).events).toContainEqual(expect.objectContaining({ type: "error", safe_to_display: true, message: expect.stringContaining("Verarbeitungsschritte") }));
  });
});
