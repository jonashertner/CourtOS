import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamChatParams, StreamChatResult } from "../../../../lib/llm/types";
import { contentSha256 } from "../../../../lib/documentVersions";

const mocks = vi.hoisted(() => ({ stream: vi.fn<(params: StreamChatParams) => Promise<StreamChatResult>>(), load: vi.fn(), download: vi.fn(), access: vi.fn(), publicRequest: vi.fn() }));
vi.mock("../../../knowledge/knowledge.service", () => ({ publicKnowledgeRequest: mocks.publicRequest }));
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
  it("rejects a source-free legacy chat before any provider call, including fabricated history citations", async () => {
    const params = { ...makeParams(), docStore: new Map(), docIndex: {}, apiMessages: [{ role: "assistant", content: "A legal conclusion [1]." }, { role: "user", content: "Tell me more from memory" }] };
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ code: "source_grounding_failed", source_issue: "required" })]) });
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain("content_delta");
  });
  it("withholds an uncited substantive paragraph despite a valid source in another paragraph", async () => {
    emit(response().replace("\n<CITATIONS>", "\n\nAn uncited legal conclusion from memory.\n<CITATIONS>"));
    const params = makeParams();
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ source_issue: "verification", grounding_diagnostics: expect.objectContaining({ reason: "uncited_paragraph" }) })]) });
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain("content_delta");
  });
  it("checks private access again before releasing a generated answer", async () => {
    mocks.access.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    emit(response());
    await expect(runLLMStream(makeParams())).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ source_issue: "unavailable" })]) });
  });
  it("never releases or persists model reasoning as checked answer text", async () => {
    mocks.stream.mockImplementationOnce(async call => {
      call.callbacks?.onReasoningDelta?.("UNVERIFIED_MODEL_MEMORY");
      call.callbacks?.onReasoningBlockEnd?.();
      call.callbacks?.onContentDelta?.(response());
      return { fullText: response() };
    });
    const params=makeParams(); const result=await runLLMStream(params);
    expect(JSON.stringify(result)).not.toContain("UNVERIFIED_MODEL_MEMORY");
    expect(params.write.mock.calls.map(([chunk])=>chunk).join("")).not.toContain("UNVERIFIED_MODEL_MEMORY");
  });
  it("binds public references to freshly fetched exact original words and rechecks before release", async () => {
    const text = "The original public court passage.";
    const selected = { decision_id: "bge_example", start: 10, end: 10 + text.length, content_hash: "fixed" };
    mocks.publicRequest.mockResolvedValue({ ok: true, data: { decision_id: selected.decision_id, title: "Original decision", content_hash: "fixed", source_url: "https://example.test/decision", pdf_url: null, passage: { start: 10, end: selected.end, total_chars: 100, text } } });
    const params = { ...makeParams(), docStore: new Map(), docIndex: {}, publicSources: [selected] };
    emit(`An interpretation of the selected passage [1].\n<CITATIONS>${JSON.stringify([{ ref: 1, doc_id: "public-0", quote: text }])}</CITATIONS>`);
    const result = await runLLMStream(params);
    expect(result.citations).toEqual([expect.objectContaining({ kind: "public_decision", decision_id: "bge_example", source_url: "https://example.test/decision", start: 10, quote: text, verified: true })]);
    expect(mocks.publicRequest).toHaveBeenCalledTimes(2);
    expect(mocks.stream.mock.calls[0][0].messages.map(m => m.content).join("\n")).toContain(text);
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain('"status":"partial"');
  });
  it("withholds public answer when the original changes during inference", async () => {
    const text = "The original public court passage.";
    const data = { decision_id: "bge_example", title: "Original", content_hash: null, source_url: null, pdf_url: null, passage: { start: 0, end: text.length, total_chars: 100, text } };
    mocks.publicRequest.mockResolvedValueOnce({ ok: true, data }).mockResolvedValueOnce({ ok: true, data: { ...data, passage: { ...data.passage, text: text.replace("original", "modified") } } });
    const params = { ...makeParams(), docStore: new Map(), docIndex: {}, publicSources: [{ decision_id: "bge_example", start: 0, end: text.length, content_hash: null }] };
    emit(`An interpretation [1].\n<CITATIONS>${JSON.stringify([{ ref: 1, doc_id: "public-0", quote: text }])}</CITATIONS>`);
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ source_issue: "changed" })]) });
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain("content_delta");
  });
  it.each(["d", "claims.pdf"])("binds an exact unique selected-source alias %s to its server handle and immutable version", async (alias) => {
    emit(response().replace('"doc_id":"doc-0"', `"doc_id":${JSON.stringify(alias)}`));
    const result = await runLLMStream(makeParams());
    expect(result.citations).toEqual([expect.objectContaining({ doc_id: "doc-0", document_id: "d", version_id: "v", verified: true })]);
  });
  it.each([
    ["another document", { document_id: "unselected-document" }, "document_mismatch"],
    ["another version", { version_id: "unselected-version" }, "version_mismatch"],
    ["a version number instead of its identity", { version_id: 1 }, "version_mismatch"],
  ])("rejects a model claim to %s instead of silently rebinding it", async (_name, identity, reason) => {
    emit(`The exhibit is a draft [1].\n<CITATIONS>${JSON.stringify([{ ref: 1, doc_id: "doc-0", page: 2, quote: "CHF 1250.", ...identity }])}</CITATIONS>`);
    const params = makeParams();
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ grounding_diagnostics: expect.objectContaining({ failures: [{ ref: 1, page: 2, reason }] }) })]) });
    expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain('"type":"content_delta"');
  });
  it.each(["claims.pdf", "d"])("rejects ambiguous alias %s when two selected versions share it", async (alias) => {
    const params = makeParams();
    params.docStore.set("doc-1", { ...params.docStore.get("doc-0")! });
    Object.assign(params.docIndex, { "doc-1": { ...params.docIndex["doc-0"], version_id: "v-older" } });
    mocks.load.mockImplementation(async (_doc, _db, version) => ({ id: version, storage_path: "fixed.pdf", filename: "claims.pdf", file_type: "pdf", version_number: 1, content_sha256: contentSha256(pdfBytes()) }));
    emit(response().replace('"doc_id":"doc-0"', `"doc_id":${JSON.stringify(alias)}`));
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ grounding_diagnostics: expect.objectContaining({ failures: [{ ref: 1, page: 2, reason: "source_unavailable" }] }) })]) });
  });
  it("does not bind an unknown alias to the only selected document", async () => {
    emit(response().replace('"doc_id":"doc-0"', '"doc_id":"other-document"'));
    await expect(runLLMStream(makeParams())).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ grounding_diagnostics: expect.objectContaining({ failures: [{ ref: 1, page: 2, reason: "source_unavailable" }] }) })]) });
  });
  it("rejects a binding changed after source read instead of switching to a newer version", async () => {
    const params = makeParams();
    mocks.stream.mockImplementationOnce(async (call) => {
      params.docIndex["doc-0"].version_id = "v-new";
      call.callbacks?.onContentDelta?.(response());
      return { fullText: response() };
    });
    await expect(runLLMStream(params)).rejects.toMatchObject({ fullText: "", events: expect.arrayContaining([expect.objectContaining({ grounding_diagnostics: expect.objectContaining({ failures: [{ ref: 1, page: 2, reason: "version_mismatch" }] }) })]) });
  });
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
      expect(context).toContain('"doc_id":"doc-0"');
      expect(context).not.toContain('"version_id":"v"');
      expect(context).not.toContain("OLD FALSE CLAIM");
      call.callbacks?.onContentDelta?.(response());
      expect(params.write.mock.calls.map(([chunk]) => chunk).join("")).not.toContain("The exhibit is a draft");
      return { fullText: response() };
    });
    const result = await runLLMStream(params);
    expect(result.citations).toEqual([expect.objectContaining({ verified: true, version_id: "v", page: 2 })]);
    expect(result.events).toContainEqual({type:"source_bound_answer",version:1});
    expect(result.events).toContainEqual(expect.objectContaining({ type: "doc_read", source_coverage: expect.objectContaining({ pages: 3, kind: "complete_extracted_text" }) }));
    const delivered = params.write.mock.calls.map(([chunk]) => chunk).join("");
    expect(delivered).toContain("The exhibit is a draft");
    expect(delivered).toContain('"status":"final"');
    expect(delivered.indexOf('"type":"source_bound_answer"')).toBeLessThan(delivered.indexOf('"type":"content_delta"'));
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
