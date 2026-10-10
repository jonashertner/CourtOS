import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamChatParams, StreamChatResult } from "../../../../lib/llm/types";
import { contentSha256 } from "../../../../lib/documentVersions";

const mocks = vi.hoisted(() => ({ stream: vi.fn<(params: StreamChatParams) => Promise<StreamChatResult>>(), load: vi.fn(), download: vi.fn(), access: vi.fn() }));
vi.mock("../../../../lib/llm", () => ({ streamChatWithTools: mocks.stream, resolveModel: (model: string) => model }));
vi.mock("../../../../lib/routerModels", () => ({ resolveRequestedModel: async (model: string) => model }));
vi.mock("../../../../lib/mcpConnectors", () => ({ buildUserMcpTools: async () => [] }));
vi.mock("../../../../lib/integrations/googleDrive", () => ({ buildGoogleDriveTools: async () => [] }));
vi.mock("../../../../lib/integrations/googleWorkspace", () => ({ buildGoogleWorkspaceTools: async () => [] }));
vi.mock("../../../../lib/memory/prompt", () => ({ buildMemoryTurn: async (args: { systemPrompt: string }) => ({ systemPrompt: args.systemPrompt }) }));
vi.mock("../../../../lib/documentVersions", async () => ({ ...(await vi.importActual("../../../../lib/documentVersions")), loadActiveVersion: mocks.load }));
vi.mock("../../../../lib/storage", () => ({ downloadFile: mocks.download }));
vi.mock("../../../../lib/access", () => ({ ensureDocAccess: mocks.access }));
vi.mock("../../../../lib/observability/sentry", () => ({ reportError: vi.fn() }));
import { AssistantStreamError, assistantStreamErrorPayload, runLLMStream } from "../streaming";
import { buildSystemPrompt } from "../prompts";
import { courtosPilotFetchInit, COURTOS_PILOT_REQUEST_BYTES } from "../../../../lib/courtosPilot";

// Actual three-page PDF, parsed by the real PDF.js extractor in this test.
// Deliberately contradictory allegations. This is test-only synthetic data.
function pdfBytes(): ArrayBuffer {
  const text = ["Party A alleges CHF 12500 paid on 5 September 2026.", "Beilage 1 is a draft dated 7 September 2026 for CHF 1250.", "No receipt or bank confirmation is present."];
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  text.forEach((line, i) => {
    const content = `BT /F1 12 Tf 30 700 Td (${line}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(pdf, "binary")).buffer;
}
const db = { from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: { id: "d", user_id: "u", status: "ready" } }) }; return q; } } as never;
const makeParams = () => ({ model: "courtos-local", apiMessages: [{ role: "system", content: buildSystemPrompt(false) }, { role: "user", content: "Compare the allegations, document and absent proof." }], docStore: new Map([["doc-0", { filename: "claims.pdf", file_type: "pdf", storage_path: "fixed.pdf" }]]), docIndex: { "doc-0": { document_id: "d", filename: "claims.pdf", version_id: "v", version_number: 1 } }, userId: "u", db, write: vi.fn<(chunk: string) => void>() });
const response = (page = 2, quote = "CHF 1250.") => `The exhibit is a draft [1].\n<CITATIONS>${JSON.stringify([{ ref: 1, doc_id: "doc-0", page, quote }])}</CITATIONS>`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COURTOS_PILOT_MODE", "true");
  mocks.load.mockResolvedValue({ id: "v", storage_path: "fixed.pdf", filename: "claims.pdf", file_type: "pdf", version_number: 1, size_bytes: pdfBytes().byteLength, content_sha256: contentSha256(pdfBytes()) });
  mocks.download.mockImplementation(async () => pdfBytes());
  mocks.access.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function emit(text: string, finishReason?: string) {
  mocks.stream.mockImplementationOnce(async (params) => { params.callbacks?.onContentDelta?.(text); return { fullText: text, finishReason } as StreamChatResult; });
}

describe("pilot source prefetch → model → page verification → release", () => {
  it("serialises the complete 3-page evidence plus actual system/tools below the real request-byte gate, offline", async () => {
    vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED", "true");
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const { streamAiSdk } = await import("../../../../lib/llm/aiSdk.js");
    let requestBytes = 0;
    const offlineFetch: typeof fetch = async (input, init) => {
      // Exactly the production body-size/destination guard, but no network.
      courtosPilotFetchInit(input, init);
      const body = String(init?.body);
      requestBytes = Buffer.byteLength(body, "utf8");
      expect(body).toContain("No receipt or bank confirmation");
      expect(body).toContain("search_knowledge");
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response() } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    };
    const provider = createOpenAICompatible({ name: "offline-test", baseURL: "http://127.0.0.1:18181/v1", fetch: offlineFetch });
    mocks.stream.mockImplementationOnce((params) => streamAiSdk(params, { provider: "openai-compatible", label: "Offline fixture", model: provider("gemma-4-12b-qat"), modelId: "courtos-local", supportsReasoning: false }));
    const result = await runLLMStream(makeParams());
    expect(result.citations).toEqual([expect.objectContaining({ verified: true })]);
    expect(requestBytes).toBeGreaterThan(5_000);
    expect(requestBytes).toBeLessThanOrEqual(COURTOS_PILOT_REQUEST_BYTES);
  });
  it("gives the actual three pages to a model that never calls a tool, then releases a verified result", async () => {
    const params = makeParams();
    params.apiMessages.splice(1, 0, { role: "assistant", content: "OLD FALSE CLAIM: payment on 20 August 2023." });
    mocks.stream.mockImplementationOnce(async (call) => {
      const context = call.messages.map((m) => m.content).join("\n");
      expect(context).toContain("CHF 12500 paid on 5 September 2026");
      expect(context).toContain("CHF 1250.");
      expect(context).toContain("No receipt or bank confirmation");
      expect(context).toContain('"version_id":"v"');
      expect(context).not.toContain("OLD FALSE CLAIM");
      call.callbacks?.onContentDelta?.(response());
      expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain("The exhibit is a draft");
      return { fullText: response() };
    });
    const result = await runLLMStream(params);
    expect(result.citations).toEqual([expect.objectContaining({ verified: true, version_id: "v", page: 2 })]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "doc_read", source_coverage: expect.objectContaining({ pages: 3, kind: "complete_extracted_text" }) }));
    const delivered = params.write.mock.calls.map(([chunk]) => chunk).join("");
    expect(delivered).toContain("The exhibit is a draft");
    expect(delivered).toContain('"status":"final"');
  });
  it.each([
    ["wrong page", response(1), "unverified_citation"],
    ["fabricated payment", response(1, "CHF 12000 paid on 20 August 2023"), "unverified_citation"],
    ["no citations", "A factual assertion without source links.", "no_references"],
    ["uncited refusal", "I cannot answer.", "no_references"],
    ["missing citation block", "An assertion [1].", "no_citations"],
  ])("withholds %s from SSE and persisted answer text", async (_name, text, reason) => {
    emit(text);
    const params = makeParams();
    const error = await runLLMStream(params).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(AssistantStreamError);
    if (!(error instanceof AssistantStreamError)) throw error;
    expect(error.fullText).toBe("");
    expect(error.events.some((event) => event.type === "content" || event.type === "reasoning")).toBe(false);
    expect(assistantStreamErrorPayload(error)).toMatchObject({ code: "source_grounding_failed", safe_to_display: true, grounding_diagnostics: { reason } });
    expect(error.events).toContainEqual(expect.objectContaining({ type: "error", grounding_diagnostics: expect.objectContaining({ reason }) }));
    expect(JSON.stringify(assistantStreamErrorPayload(error).grounding_diagnostics)).not.toMatch(/CHF|Beilage|assertion|cannot answer/);
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain('"type":"content_delta"');
  });
  it("does not expose an incomplete stream when the provider hits its output limit", async () => {
    emit(response(), "length");
    const params = makeParams();
    const error = await runLLMStream(params).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ code: "source_grounding_failed" })]) });
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain('"type":"content_delta"');
  });
  it("fails before inference when the bound version is missing or its hash changes", async () => {
    mocks.load.mockResolvedValueOnce(null);
    await expect(runLLMStream(makeParams())).rejects.toMatchObject({ fullText: "" });
    expect(mocks.stream).not.toHaveBeenCalled();
    mocks.download.mockResolvedValueOnce(Uint8Array.from([1, 2, 3]).buffer);
    await expect(runLLMStream(makeParams())).rejects.toMatchObject({ fullText: "" });
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
