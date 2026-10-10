import { courtosKnowledgeEnabled } from "../../../lib/courtosKnowledge";
import { KNOWLEDGE_TOOLS } from "./tools/toolSchemas";
import { courtosPilotEnabled, courtosPilotToolAllowed } from "../../../lib/courtosPilot";
import { buildGoogleWorkspaceTools } from "../../../lib/integrations/googleWorkspace";
import {
  streamChatWithTools,
  resolveModel,
  type LlmMessage,
  type OpenAIToolSchema,
} from "../../../lib/llm";
import { resolveRequestedModel } from "../../../lib/routerModels";
import { UserFacingError } from "../../../lib/userFacingError";
import { InvalidApiKeyError } from "../../../lib/llm/apiKeyErrors";
import { reportError } from "../../../lib/observability/sentry";
import type { Db } from "../../../lib/supabase";
import { buildUserMcpTools } from "../../../lib/mcpConnectors";
import { buildGoogleDriveTools } from "../../../lib/integrations/googleDrive";
import { COURTLISTENER_TOOLS } from "./tools/courtlistenerTools";
import {
  type DocStore,
  type DocIndex,
  type TabularCellStore,
  type WorkflowStore,
  type ToolCall,
  devLog,
  resolveDocLabel,
  TOOL_ERROR_MESSAGE,
} from "./types";
import {
  TOOLS,
  WORKFLOW_TOOLS,
  isDocumentMutatingTool,
  withoutDocumentMutatingTools,
  withKnowledgeReadDescriptions,
} from "./tools/toolSchemas";
import {
  parseCitationsWithDiagnostics,
  parsePartialCitationObjects,
  createCitation,
  CITATIONS_OPEN_TAG,
} from "./citations";
import { runToolCalls } from "./tools/toolDispatcher";
import {
  getCachedCaseOpinionTexts,
  type CourtlistenerTurnState,
} from "./tools/courtlistenerTurnState";
import {
  readDocumentContent,
  type TurnEditState,
  type TurnReadState,
} from "./tools/documentOps";
import { verifyCitations } from "./verifyCitations";
import { buildMemoryTurn } from "../../../lib/memory/prompt";
import { prefetchSourceEvidence, sourceEvidencePrompt, SourceGroundingError, type DocumentEvidence } from "./sourceEvidence";
import { spotlight } from "./contextBuilders";
import { groundingDiagnostics } from "./groundingDiagnostics";
import { loadPublicSourceEvidence, publicEvidencePrompt, publicCitation, samePublicEvidence, type PublicSourceEvidence } from "./publicSourceEvidence";
import { hasUncitedProse, SOURCE_BOUND_ANSWER_RULES } from "./sourceBoundAnswer";

export type { AssistantEvent } from "@mike/contracts";
import type { AssistantEvent, AssistantErrorCode, SourceGroundingDiagnostics, LocalProviderQueueEvent } from "@mike/contracts";

/**
 * Tools the model can call that execute outside this process — in the Word
 * task pane. The adapter owns forwarding the call to the client and awaiting
 * its posted result; the loop treats the returned content exactly like a
 * server-side tool result.
 */
export interface ClientToolsAdapter {
  schemas: OpenAIToolSchema[];
  owns: (name: string) => boolean;
  execute: (
    call: import("../../../lib/llm").NormalizedToolCall,
  ) => Promise<{ content: string; events: AssistantEvent[] }>;
}

export class AssistantStreamError extends Error {
  fullText: string;
  events: AssistantEvent[];

  constructor(
    message: string,
    fullText: string,
    events: AssistantEvent[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AssistantStreamError";
    this.fullText = fullText;
    this.events = events;
  }
}

export const ASSISTANT_ERROR_MESSAGE =
  "The response could not be completed. Please try again.";

/**
 * What to tell the client about a failed stream.
 *
 * The engine already decided whether a failure is safe to show (a rejected API
 * key, an unavailable model) and tagged it on the error event. Every streaming
 * route has to forward that verdict rather than flattening to "try again",
 * which sends the user to retry something that cannot succeed — so the choice
 * lives here once instead of in each route's catch.
 */
export function assistantStreamErrorPayload(error: unknown): {
  message: string;
  safe_to_display?: true;
  code?: AssistantErrorCode;
  source_issue?: import("@mike/contracts").SourceGroundingIssue;
  grounding_diagnostics?: SourceGroundingDiagnostics;
} {
  if (error instanceof SourceGroundingError) {
    return { message: error.message, safe_to_display: true, code: error.code, source_issue: error.issue, ...(error.diagnostics ? { grounding_diagnostics: error.diagnostics } : {}) };
  }
  const safe =
    error instanceof AssistantStreamError
      ? [...error.events]
          .reverse()
          .find(
            (event): event is Extract<AssistantEvent, { type: "error" }> =>
              event.type === "error" && event.safe_to_display === true,
          )
      : undefined;
  if (!safe) return { message: ASSISTANT_ERROR_MESSAGE };
  return {
    message: safe.message,
    safe_to_display: true,
    ...(safe.code ? { code: safe.code } : {}),
    ...(safe.source_issue ? { source_issue: safe.source_issue } : {}),
    ...(safe.grounding_diagnostics ? { grounding_diagnostics: safe.grounding_diagnostics } : {}),
  };
}

function sanitizeAssistantEvent(event: AssistantEvent): AssistantEvent {
  if (event.type === "error") {
    return event.safe_to_display
      ? event
      : { ...event, message: ASSISTANT_ERROR_MESSAGE };
  }
  if ("error" in event && typeof event.error === "string" && event.error) {
    return { ...event, error: TOOL_ERROR_MESSAGE };
  }
  return event;
}

export function sanitizeAssistantSseChunk(chunk: string): string {
  if (!chunk.startsWith("data: ")) return chunk;
  const payload = chunk.slice(6).trim();
  if (!payload || payload === "[DONE]") return chunk;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return chunk;
    }
    const sanitized = sanitizeAssistantEvent(parsed as AssistantEvent);
    return `data: ${JSON.stringify(sanitized)}\n\n`;
  } catch {
    return chunk;
  }
}

export class AssistantStreamAbortError extends AssistantStreamError {
  constructor(fullText: string, events: AssistantEvent[]) {
    super("Stream aborted.", fullText, events);
    this.name = "AbortError";
  }
}

class AssistantStreamAskInputsPause extends Error {
  constructor() {
    super("Waiting for user input.");
    this.name = "AssistantStreamAskInputsPause";
  }
}

function isAskInputsPause(error: unknown): boolean {
  if (error instanceof AssistantStreamAskInputsPause) return true;
  if (!error || typeof error !== "object") return false;
  const record = error as {
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (
    record.name === "AssistantStreamAskInputsPause" ||
    record.message === "Waiting for user input."
  ) {
    return true;
  }
  return record.cause !== error && isAskInputsPause(record.cause);
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown };
  return record.name === "AbortError" || record.message === "Stream aborted.";
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const err = new Error("Stream aborted.");
  err.name = "AbortError";
  throw err;
}

export async function runLLMStream(params: {
  apiMessages: unknown[];
  docStore: DocStore;
  docIndex: DocIndex;
  publicSources?: import("@mike/contracts").PublicSourceSelection[];
  userId: string;
  /**
   * The caller's authenticated email. Direct (email-keyed) grants are part of
   * the per-document role check edit_document runs before it writes, so a
   * surface that omits it only lets the model edit documents the caller
   * reaches as creator or organization member.
   */
  userEmail?: string | null;
  db: Db;
  write: (s: string) => void;
  onActivity?: () => void;
  extraTools?: unknown[];
  includeResearchTools?: boolean;
  /** Expose ask_inputs only to clients that can render and answer it. */
  includeAskInputs?: boolean;
  /**
   * The surface continues a paused turn from an ask_inputs_response, so a
   * connector write can wait there for the user's approval. Surfaces without
   * that continuation refuse writes that need approval instead.
   */
  connectorApprovals?: boolean;
  /**
   * May this turn WRITE documents (edit_document, replicate_document, the
   * generate_* family)? Defaults to true; pass false and those tools are
   * neither advertised to the model nor executed if it asks for one anyway.
   *
   * The caller decides this from the role the caller holds on the CONTAINER
   * whose documents the tools would touch — not from their standing in the
   * chat. The two come apart: a project viewer named on one chat's share
   * list writes in that thread as a member, and without this partition the
   * thread would hand them edit_document over every document in the project.
   */
  allowDocumentMutation?: boolean;
  workflowStore?: WorkflowStore;
  tabularStore?: TabularCellStore;
  /** Tools executed by the connected client (Word add-in) instead of here. */
  clientTools?: ClientToolsAdapter;
  /**
   * Tool-loop iteration budget (default 10). Surfaces whose tools are built
   * around retry round-trips (Word client edits: propose → fail → re-read →
   * retry) need headroom, or the loop ends before the model's summary.
   */
  maxIterations?: number;
  buildCitations?: (fullText: string) => unknown[];
  model?: string;
  /** AI SDK reasoning effort for this interactive request. */
  reasoning?: import("../../../lib/llm").ReasoningLevel;
  apiKeys?: import("../../../lib/llm").UserApiKeys;
  signal?: AbortSignal;
  /** Let a route persist the completed turn before it signals stream success. */
  emitDone?: boolean;
  /** Add read-only app/project memory as an earliest untrusted reference turn. */
  includeMemory?: boolean;
  /** Memory scope is independent from generated-document destination. */
  memoryProjectId?: string | null;
  /** Tell the memory policy whether other people can see the persisted turn. */
  memorySharedAudience?: boolean;
  /**
   * If set, generate_docx will attach created docs to this project so
   * they appear in the project sidebar. Leave null for general chats —
   * generated docs still get persisted, but as standalone documents.
   */
  projectId?: string | null;
  /** Spotlighting nonce — generated by the caller and passed here so that
   *  the same nonce fences both the system-prompt filenames (added by
   *  buildMessages) and the document bodies returned by tools. */
  nonce?: string;
  /** Durable conversation id, forwarded to the provider as a cache hint. */
  conversationId?: string | null;
}): Promise<{
  fullText: string;
  events: AssistantEvent[];
  citations: unknown[];
}> {
  const {
    apiMessages,
    docStore,
    docIndex,
    publicSources = [],
    userId,
    userEmail,
    db,
    write: unsafeWrite,
    extraTools,
    includeResearchTools = true,
    includeAskInputs = true,
    connectorApprovals = false,
    allowDocumentMutation = true,
    workflowStore,
    tabularStore,
    clientTools,
    buildCitations,
    model,
    apiKeys,
    signal,
    projectId,
    includeMemory = false,
    memoryProjectId,
    memorySharedAudience = false,
    nonce,
    conversationId,
  } = params;
  // This is shared by every reachable pilot chat surface, including legacy
  // /assistant. An old transcript or a model's memory never admits a source.
  const requiresEvidence = courtosPilotEnabled();
  const heldOutput: string[] = [];
  let evidenceReleased = false;
  const write = (chunk: string) => {
    const safe = sanitizeAssistantSseChunk(chunk);
    if (requiresEvidence && !evidenceReleased && safe.startsWith("data: ")) {
      try {
        const event = JSON.parse(safe.slice(6).trim()) as { type?: string };
        // Model reasoning is neither a checked answer nor source evidence.
        // Never publish it, even after the final answer passes its quote gate.
        if (["reasoning_delta", "reasoning_block_end"].includes(event.type ?? "")) return;
        if (["content_delta", "citations"].includes(event.type ?? "")) {
          heldOutput.push(safe);
          return;
        }
      } catch { /* Non-JSON terminators follow the normal path. */ }
    }
    unsafeWrite(safe);
  };
  const researchTools = includeResearchTools && !courtosPilotEnabled() ? COURTLISTENER_TOOLS : [];
  const mcpTools = await buildUserMcpTools(userId, db);
  const googleDriveTools = await buildGoogleDriveTools(userId, db);
  const taskTools = courtosKnowledgeEnabled() ? withKnowledgeReadDescriptions(TOOLS) : TOOLS;
  const conversationTools = includeAskInputs
    ? taskTools
    : taskTools.filter((tool) => tool.function.name !== "ask_inputs");
  const baseTools = [...conversationTools, ...researchTools, ...WORKFLOW_TOOLS, ...(courtosKnowledgeEnabled() ? KNOWLEDGE_TOOLS : [])];
  const advertisedTools = [
    ...baseTools,
    ...mcpTools,
    ...googleDriveTools,
    ...(await buildGoogleWorkspaceTools(userId, db)),
    ...(extraTools ?? []),
    ...(clientTools?.schemas ?? []),
  ];
  // Hiding the schema is the first half of the gate: a tool the model was
  // never shown is a tool it will not plan around. The second half is in
  // `runTools` below, because "not advertised" is not "not callable" — a
  // model can name a tool from memory.
  const pilotTools = advertisedTools.filter((tool) => {
    if (!courtosPilotEnabled()) return true;
    const name = (tool as { function?: { name?: unknown } } | null)?.function?.name;
    return typeof name === "string" && courtosPilotToolAllowed(name) && !clientTools?.owns(name);
  });
  const activeTools = allowDocumentMutation
    ? pilotTools
    : withoutDocumentMutatingTools(pilotTools);

  // Extract system prompt; pass remaining turns to the adapter as
  // plain user/assistant messages (assistant turns may carry stored
  // reasoning, which only reasoning-replaying models receive).
  const rawMsgs = apiMessages as {
    role: string;
    content: string | null;
    reasoning?: string;
  }[];
  const baseSystemPrompt =
    rawMsgs[0]?.role === "system" ? (rawMsgs[0].content ?? "") : "";
  const memory = await buildMemoryTurn({
    db,
    userId,
    systemPrompt: baseSystemPrompt,
    include: includeMemory,
    projectId: memoryProjectId,
    sharedAudience: memorySharedAudience,
  });
  const systemPrompt = requiresEvidence ? `${memory.systemPrompt}\n\n${SOURCE_BOUND_ANSWER_RULES}` : memory.systemPrompt;
  const chatMessages: LlmMessage[] = rawMsgs
    // Prior assistant prose is not evidence and may predate verification.
    // User instructions remain; factual grounding comes from fresh PDFs only.
    .filter((m) => m.role !== "system" && (!requiresEvidence || m.role !== "assistant"))
    .map(
      (m): LlmMessage =>
        m.role === "assistant" && m.reasoning
          ? { role: "assistant", content: m.content ?? "", reasoning: m.reasoning }
          : {
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content ?? "",
            },
    )
    // An assistant turn with no text (an error, a cancellation, or a client
    // that keeps prose in events) carries nothing for the model, and Anthropic
    // rejects the entire request over one empty text block.
    .filter((m) => m.role === "user" || m.content.trim().length > 0);
  // Before every real turn: see MemoryTurn for why it goes there.
  if (memory.message && !requiresEvidence) chatMessages.unshift(memory.message);

  const events: AssistantEvent[] = [];
  // One assistant turn produces at most one document_versions row per
  // edited doc. `runToolCalls` fires once per tool-call batch; the model
  // may emit multiple batches in a single turn, so this map persists
  // across batches to let subsequent edit_document calls overwrite the
  // turn's existing version instead of creating a new one.
  const turnEditState: TurnEditState = new Map();
  // Suppress repeated full-document reads for the same document/version in
  // one assistant response. The guard is invalidated when edit_document
  // changes that document so a post-edit verification read can still happen.
  const turnReadState: TurnReadState = new Map();
  let sourceEvidence = new Map<string, DocumentEvidence>();
  let publicEvidence = new Map<string, PublicSourceEvidence>();
  const courtlistenerTurnState: CourtlistenerTurnState = {
    casesByClusterId: new Map(),
  };
  let fullText = "";
  let iterText = "";
  let iterVisibleText = "";
  let iterReasoning = "";
  let visibleTailBuffer = "";
  let citationsOpenSeen = false;
  let streamingCitationsBuffer = "";
  let streamedCitationCount = 0;

  const emitCitationStreamSnapshot = (
    status: "started" | "partial",
    citations: unknown[],
  ) => {
    if (buildCitations || requiresEvidence) return;
    write(
      `data: ${JSON.stringify({ type: "citations", status, citations })}\n\n`,
    );
  };

  const streamHiddenCitationContent = (delta: string) => {
    if (buildCitations || !delta) return;
    streamingCitationsBuffer += delta;
    const partial = parsePartialCitationObjects(streamingCitationsBuffer);
    if (partial.length <= streamedCitationCount) return;
    streamedCitationCount = partial.length;
    const citations = partial.map((c) =>
      createCitation(
        c,
        docIndex,
        courtlistenerTurnState.casesByClusterId,
        docStore,
      ),
    );
    emitCitationStreamSnapshot("partial", citations);
  };

  const streamVisibleContent = (delta: string) => {
    if (!delta) return;
    if (citationsOpenSeen) {
      streamHiddenCitationContent(delta);
      return;
    }

    const combined = visibleTailBuffer + delta;
    const markerIdx = combined.indexOf(CITATIONS_OPEN_TAG);
    if (markerIdx >= 0) {
      const visible = combined.slice(0, markerIdx);
      if (visible) {
        iterVisibleText += visible;
        write(
          `data: ${JSON.stringify({ type: "content_delta", text: visible })}\n\n`,
        );
      }
      visibleTailBuffer = "";
      citationsOpenSeen = true;
      streamingCitationsBuffer = "";
      streamedCitationCount = 0;
      emitCitationStreamSnapshot("started", []);
      streamHiddenCitationContent(
        combined.slice(markerIdx + CITATIONS_OPEN_TAG.length),
      );
      return;
    }

    const keep = Math.min(CITATIONS_OPEN_TAG.length - 1, combined.length);
    const visible = combined.slice(0, combined.length - keep);
    visibleTailBuffer = combined.slice(combined.length - keep);
    if (visible) {
      iterVisibleText += visible;
      write(
        `data: ${JSON.stringify({ type: "content_delta", text: visible })}\n\n`,
      );
    }
  };

  const flushVisibleTail = (opts: { emit?: boolean } = {}) => {
    const emit = opts.emit ?? true;
    if (citationsOpenSeen || !visibleTailBuffer) {
      visibleTailBuffer = "";
      return;
    }
    iterVisibleText += visibleTailBuffer;
    if (emit) {
      write(
        `data: ${JSON.stringify({ type: "content_delta", text: visibleTailBuffer })}\n\n`,
      );
    }
    visibleTailBuffer = "";
  };

  const flushText = (opts: { emit?: boolean } = {}) => {
    if (!iterText) return;
    fullText += iterText;
    flushVisibleTail(opts);
    if (iterVisibleText) {
      events.push({ type: "content", text: iterVisibleText });
    }
    iterText = "";
    iterVisibleText = "";
    visibleTailBuffer = "";
    citationsOpenSeen = false;
    streamingCitationsBuffer = "";
    streamedCitationCount = 0;
  };

  const flushPartialTurn = (opts: { emit?: boolean } = {}) => {
    flushText(opts);
    if (iterReasoning) {
      events.push({ type: "reasoning", text: iterReasoning });
      iterReasoning = "";
    }
  };

  try {
    throwIfAborted(signal);
    if (requiresEvidence) {
      if (!docStore.size && !publicSources.length) throw new SourceGroundingError("Bitte zuerst eigene Dokumente oder eine öffentliche Originalfundstelle auswählen. Das Gespräch verwendet keine unbelegten Antworten aus Modellwissen.", undefined, "required");
      sourceEvidence = await prefetchSourceEvidence(docStore, docIndex, db, userId, userEmail);
      publicEvidence = await loadPublicSourceEvidence(publicSources);
      throwIfAborted(signal);
      const sourceText = sourceEvidencePrompt(sourceEvidence) + (publicEvidence.size ? `\n${publicEvidencePrompt(publicEvidence)}` : "");
      if (Buffer.byteLength(sourceText, "utf8") > 14_000) throw new SourceGroundingError("Die ausgewählten Quellen sind für diesen Gesprächsschritt zu umfangreich. Bitte die Auswahl eingrenzen.", undefined, "scope");
      // Fresh source material immediately before the latest user instruction.
      // The existing nonce fence treats all document text as untrusted data.
      chatMessages.splice(Math.max(0, chatMessages.length - 1), 0, {
        role: "user",
        content: `Application-loaded original source evidence. Selected PDFs are complete extracted text; public decisions are only the explicitly selected excerpts. Neither proves the allegations true.\n${nonce ? spotlight(sourceText, nonce) : sourceText}`,
      });
      for (const [label, source] of sourceEvidence) {
        const event: AssistantEvent = { type: "doc_read", filename: source.filename, document_id: source.document_id, version_id: source.version_id, version_number: source.version_number,
          source_coverage: { kind: "complete_extracted_text", pages: source.pages.length, text_bytes: source.pages.reduce((sum, page) => sum + Buffer.byteLength(page.text, "utf8"), 0), pdf_sha256: source.pdf_sha256, version_sha256: source.version_sha256 } };
        events.push(event);
        write(`data: ${JSON.stringify(event)}\n\n`);
        turnReadState.set(`${source.document_id}:${source.version_id}`, { docLabel: label, filename: source.filename, documentId: source.document_id, versionId: source.version_id, versionNumber: source.version_number, storagePath: docStore.get(label)!.storage_path });
      }
    }
    // Single request-time choke point for every runLLMStream caller (chat,
    // project chat, Word chat, tabular): router-prefixed models must be in the
    // user's saved selection.
    //
    // This lives INSIDE the try because it touches the database. Above it, a
    // read failure escaped as a bare rejection — before any error event was
    // pushed and before AssistantStreamError could carry the partial turn — so
    // the SSE client saw the socket end with no explanation. Inside, a blip
    // takes the same path as any other mid-stream failure.
    //
    // "throw" (not silent fallback) because `model` here is what the caller
    // asked for in THIS request. Stored task models are validated by their
    // route before they arrive here, but this guard keeps every caller safe.
    const requestedModel = resolveModel(model, "");
    if (!requestedModel) {
      throw new UserFacingError(
        model
          ? `Model "${model}" is not available. Select another model.`
          : "Select a model before sending a message.",
      );
    }
    const selectedModel = await resolveRequestedModel(
      requestedModel,
      "",
      userId,
      db,
      "throw",
    );
    const completion = await streamChatWithTools({
      model: selectedModel,
      systemPrompt,
      messages: chatMessages,
      tools: activeTools as OpenAIToolSchema[],
      // Keep in step with DEFAULT_MAX_ITERATIONS in llm/aiSdk.ts. Deliberately
      // a literal, not an import: tests mock the "../llm" barrel, and reaching
      // past it into llm/aiSdk loads the real SDK module into suites that only
      // ever wanted the mock, which broke unrelated tests at random.
      maxIterations: courtosPilotEnabled() ? Math.min(params.maxIterations ?? 3, 3) : params.maxIterations ?? 16,
      apiKeys,
      reasoning: courtosPilotEnabled() ? "none" : params.reasoning ?? "high",
      abortSignal: signal,
      conversationId,
      callbacks: {
        onActivity: params.onActivity,
        onProviderState: state => { write(`data: ${JSON.stringify({ type: "provider_queue", state } satisfies LocalProviderQueueEvent)}\n\n`); },
        onContentDelta: (delta) => {
          iterText += delta;
          streamVisibleContent(delta);
        },
        onReasoningDelta: (delta) => {
          iterReasoning += delta;
          write(
            `data: ${JSON.stringify({ type: "reasoning_delta", text: delta })}\n\n`,
          );
        },
        onReasoningBlockEnd: () => {
          if (!iterReasoning) return;
          events.push({ type: "reasoning", text: iterReasoning });
          write(`data: ${JSON.stringify({ type: "reasoning_block_end" })}\n\n`);
          iterReasoning = "";
        },
        // Fires after Claude's turn ends with stop_reason=tool_use, before
        // the tool actually runs. Flushes any buffered assistant text so
        // it's emitted in chronological order, then signals the client so
        // it can open a fresh PreResponseWrapper (shows "Working…") while
        // the tool executes — avoids the dead gap between message_stop
        // and the first tool-specific event.
        onToolCallStart: (call) => {
          flushText();
          write(
            `data: ${JSON.stringify({
              type: "tool_call_start",
              name: call.name,
            })}\n\n`,
          );
        },
      },
      runTools: async (calls) => {
        throwIfAborted(signal);
        // Emit any text the model produced before this tool turn so the
        // UI sees it before the tool results stream in.
        flushText();

        // Client-executed tools (Word add-in) round-trip through the SSE
        // stream and never enter the server dispatcher. They run before the
        // server batch and sequentially among themselves: each call mutates
        // or reads the live document, so order is part of their semantics.
        const clientResultByCallId = new Map<string, string>();
        // Enforcement, not just omission: a document-writing call from a
        // caller who may not write is dropped before dispatch, on the server
        // side and the client side alike. It falls through to the
        // "Tool 'x' is not available." answer below, which every tool_use
        // without a result already gets, so the model is told plainly rather
        // than left waiting on a call that silently did nothing.
        const pilotCalls = calls.filter((c) => courtosPilotToolAllowed(c.name) &&
          !(courtosPilotEnabled() && clientTools?.owns(c.name)));
        const permittedCalls = allowDocumentMutation
          ? pilotCalls
          : pilotCalls.filter((c) => !isDocumentMutatingTool(c.name));
        const serverCalls = clientTools
          ? permittedCalls.filter((c) => !clientTools.owns(c.name))
          : permittedCalls;
        if (clientTools) {
          for (const call of permittedCalls) {
            if (!clientTools.owns(call.name)) continue;
            const { content, events: clientEvents } =
              await clientTools.execute(call);
            clientResultByCallId.set(call.id, content);
            events.push(...clientEvents);
            throwIfAborted(signal);
          }
        }

        const toolCalls: ToolCall[] = serverCalls.map((c) => ({
          id: c.id,
          function: {
            name: c.name,
            arguments: JSON.stringify(c.input),
          },
        }));
        const {
          toolResults,
          docsRead,
          docsFound,
          docsCreated,
          docsReplicated,
          workflowsApplied,
          docsEdited,
          askInputsEvents,
          courtlistenerEvents,
          caseCitationEvents,
          mcpEvents,
        } = await runToolCalls(
          toolCalls,
          docStore,
          userId,
          db,
          write,
          workflowStore,
          tabularStore,
          docIndex,
          turnEditState,
          turnReadState,
          projectId,
          courtlistenerTurnState,
          apiKeys,
          nonce,
          {
            connectorApprovals: connectorApprovals && includeAskInputs,
            userEmail,
          },
        );
        throwIfAborted(signal);
        for (const r of docsRead) {
          events.push({
            type: "doc_read",
            filename: r.filename,
            document_id: r.document_id,
            version_id: r.version_id,
            version_number: r.version_number,
          });
        }
        for (const f of docsFound) {
          events.push({
            type: "doc_find",
            filename: f.filename,
            document_id: f.document_id,
            version_id: f.version_id,
            version_number: f.version_number,
            query: f.query,
            total_matches: f.total_matches,
          });
        }
        for (const dl of docsCreated) {
          events.push({
            type: "doc_created",
            filename: dl.filename,
            download_url: dl.download_url,
            document_id: dl.document_id,
            version_id: dl.version_id,
            version_number: dl.version_number ?? null,
          });
        }
        for (const r of docsReplicated) {
          events.push({
            type: "doc_replicated",
            filename: r.filename,
            count: r.count,
            copies: r.copies,
          });
        }
        for (const wf of workflowsApplied) {
          events.push({
            type: "workflow_applied",
            workflow_id: wf.workflow_id,
            title: wf.title,
          });
        }
        for (const e of docsEdited) {
          events.push({
            type: "doc_edited",
            filename: e.filename,
            document_id: e.document_id,
            version_id: e.version_id,
            version_number: e.version_number,
            download_url: e.download_url,
            annotations: e.annotations,
          });
        }
        for (const askInputsEvent of askInputsEvents) {
          write(`data: ${JSON.stringify(askInputsEvent)}\n\n`);
          events.push(askInputsEvent);
        }
        for (const event of courtlistenerEvents) {
          events.push(event);
        }
        for (const event of mcpEvents) {
          events.push(event);
        }
        for (const event of caseCitationEvents) {
          events.push(event);
        }

        if (askInputsEvents.length > 0) {
          throw new AssistantStreamAskInputsPause();
        }

        // Index alignment would break if any tool branch skips its
        // push (unhandled tool name, disabled store, guard failure).
        // Each tool_result already carries its tool_call_id, so key off
        // that directly — and fall back to an error result for any
        // tool_use that didn't produce one, so Claude's next request
        // has a tool_result for every tool_use it sent.
        const resultByCallId = new Map<string, string>(clientResultByCallId);
        for (const r of toolResults) {
          const row = r as {
            tool_call_id: string;
            content?: unknown;
          };
          resultByCallId.set(row.tool_call_id, String(row.content ?? ""));
        }
        if (courtosKnowledgeEnabled() && serverCalls.some((call) => call.name === "search_knowledge" && resultByCallId.has(call.id))) {
          // Retrieval has returned. The next local model hop can take minutes;
          // do not leave the interface claiming that the search is still running.
          // A failed/empty search must not be labelled as checked evidence.
          write(`data: ${JSON.stringify({ type: "tool_call_complete", name: "search_knowledge", has_evidence: docsFound.length > 0 })}\n\n`);
        }
        // Answer every tool_use the model sent — client and server alike —
        // in the model's original call order.
        return calls.map((c) => ({
          tool_use_id: c.id,
          content:
            resultByCallId.get(c.id) ??
            JSON.stringify({
              error: `Tool '${c.name}' is not available.`,
            }),
        }));
      },
    });
    if (courtosPilotEnabled()) {
      if (completion.finishReason === "length" || completion.stopReason === "output_limit") {
        throw new UserFacingError("Ausgabe am Tokenlimit beendet. Dieser Entwurf ist unvollständig; auch Quellenverweise können fehlen. Bitte auf eine engere Teilfrage begrenzen.");
      }
      if (completion.stopReason === "step_limit") {
        throw new UserFacingError("Die verfügbaren Verarbeitungsschritte sind aufgebraucht. Dieser Entwurf ist unvollständig. Bitte eine engere Teilfrage stellen.");
      }
      // A bare [1] is no evidence link. Catch missing/malformed citation JSON
      // even when the provider reports a normal stop, before declaring success.
      const draft = fullText + iterText;
      const visible = draft.split(CITATIONS_OPEN_TAG)[0];
      const refs = [...visible.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      const parsed = parseCitationsWithDiagnostics(draft);
      if (refs.some((ref) => !parsed.citations.some((c) => c.ref === ref))) {
        const message = "Die Quellenverweise wurden nicht vollständig erzeugt. Nummern in diesem Entwurf sind keine geprüften Fundstellen. Bitte eine engere Teilfrage mit höchstens drei Belegen stellen und die Quellen selbst prüfen.";
        if (requiresEvidence) throw new SourceGroundingError(message, groundingDiagnostics(refs, parsed.citations, parsed.diagnostics));
        throw new UserFacingError(message);
      }
    }
  } catch (err) {
    if (isAskInputsPause(err)) {
      // The ask_inputs event has already been emitted and persisted in `events`.
      // Stop this assistant turn here so the model does not add redundant
      // prose telling the user to answer the picker or attach documents.
    } else if (isAbortError(err)) {
      flushPartialTurn({ emit: false });
      throw new AssistantStreamAbortError(
        requiresEvidence ? "" : fullText,
        events.filter((event) => !requiresEvidence || !["content", "reasoning"].includes(event.type)).map(sanitizeAssistantEvent),
      );
    } else {
      flushPartialTurn();
      const safeToDisplay = err instanceof UserFacingError;
      // The response already started, so the HTTP 500 path never sees this:
      // it is the one report of the turn's failure. Reporting it HERE, before
      // any console.error, is what lets the console bridge recognise every
      // later log of it — this line's, and the route's log of the
      // AssistantStreamError below, whose `cause` is `err` — as already sent.
      // A UserFacingError (rejected or missing API key, model not allowed)
      // is the user's configuration rather than our bug: still one event, so
      // operators see a rejected key with its provider_error tag, but a
      // warning, not an error. (Left unreported, the console bridge filed it
      // anyway, at error level, as MIKE-BACKEND-E.)
      reportError(err, {
        tags: { component: "chat-stream" },
        ...(safeToDisplay ? { level: "warning" as const } : {}),
      });
      console.error("[chat/stream] model stream failed", err);
      const message = safeToDisplay ? err.message : ASSISTANT_ERROR_MESSAGE;
      events.push({
        type: "error",
        message,
        ...(safeToDisplay ? { safe_to_display: true } : {}),
        ...(err instanceof SourceGroundingError ? { source_issue: err.issue } : {}),
        ...(err instanceof SourceGroundingError && err.diagnostics ? { grounding_diagnostics: err.diagnostics } : {}),
        // A rejected key is worth naming: the client turns this into a prompt
        // to go fix the key rather than a suggestion to retry.
        ...(err instanceof InvalidApiKeyError
          ? { code: "invalid_api_key" as const }
          : requiresEvidence || err instanceof SourceGroundingError ? { code: "source_grounding_failed" as const } : {}),
      });
      throw new AssistantStreamError(
        message,
        requiresEvidence ? "" : fullText,
        events.filter((event) => !requiresEvidence || !["content", "reasoning"].includes(event.type)).map(sanitizeAssistantEvent),
        { cause: err },
      );
    }
  }

  flushText();

  // Parse and emit citations from <CITATIONS> block
  const { citations: parsedCitations, diagnostics: citationDiagnostics } =
    parseCitationsWithDiagnostics(fullText);
  let citations: unknown[];
  if (buildCitations && !requiresEvidence) {
    // Custom builders (tabular) bypass document-citation verification.
    citations = buildCitations(fullText);
  } else {
    const rawCitations = buildCitations ? buildCitations(fullText) : parsedCitations.map((c) =>
      publicCitation(c, publicEvidence) ?? createCitation(
        c,
        docIndex,
        courtlistenerTurnState.casesByClusterId,
        docStore,
      ),
    );
    // Server-side quote verification. Fetch each document's extracted source
    // text at most once per turn (memoized by doc_id), reading only bytes
    // already in storage with emitEvents:false. Case citations are matched
    // against the opinion text cached during this turn.
    const sourceTextByDocId = new Map<string, Promise<string>>();
    const getSourceText = (docId: string): Promise<string> => {
      let pending = sourceTextByDocId.get(docId);
      if (!pending) {
        const label = resolveDocLabel(docId, docStore, docIndex);
        pending = label
          ? readDocumentContent(label, docStore, () => {}, docIndex, db, {
              emitEvents: false,
            })
          : Promise.resolve("");
        sourceTextByDocId.set(docId, pending);
      }
      return pending;
    };
    const privateRaw = rawCitations.filter(c => (c as { kind?: string })?.kind !== "public_decision");
    const privateVerified = await verifyCitations(
      privateRaw,
      requiresEvidence ? async (docId) => {
        const label = resolveDocLabel(docId, docStore, docIndex);
        return label ? sourceEvidence.get(label) ?? null : null;
      } : getSourceText,
      async (clusterId) =>
        getCachedCaseOpinionTexts(courtlistenerTurnState, clusterId),
    );
    let privateIndex = 0;
    citations = rawCitations.map(c => (c as { kind?: string })?.kind === "public_decision" ? c : privateVerified[privateIndex++]);
  }
  if (requiresEvidence) {
    const visible = fullText.split(CITATIONS_OPEN_TAG)[0];
    const refs = [...visible.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
    const verified = citations as { ref?: number; verified?: boolean }[];
    const uncited = hasUncitedProse(visible, new Set(verified.filter(c => c.verified === true && Number.isSafeInteger(c.ref)).map(c => c.ref!)));
    const invalidReferences = verified.length > 3 || new Set(verified.map(c => c.ref)).size !== verified.length || verified.some(c => !Number.isSafeInteger(c.ref) || c.ref! < 1);
    if (!refs.length || !verified.length || invalidReferences || verified.some((citation) => citation.verified !== true) || refs.some((ref) => !verified.some((citation) => citation.ref === ref)) || uncited) {
      const diagnostics = groundingDiagnostics(refs, citations, citationDiagnostics);
      if (uncited && refs.length && verified.every(c => c.verified === true)) diagnostics.reason = "uncited_paragraph";
      const failure = new SourceGroundingError(undefined, diagnostics);
      console.warn("[chat/grounding] answer withheld", diagnostics);
      const safeEvents = events.filter((event) => !["content", "reasoning"].includes(event.type));
      safeEvents.push({ type: "error", message: failure.message, safe_to_display: true, code: failure.code, source_issue: failure.issue, grounding_diagnostics: diagnostics });
      throw new AssistantStreamError(failure.message, "", safeEvents.map(sanitizeAssistantEvent), { cause: failure });
    }
    try {
      // Re-admit exactly the same versions/passages after generation. Access
      // revocation or a changed public original cannot publish stale evidence.
      const freshPrivate = await prefetchSourceEvidence(docStore, docIndex, db, userId, userEmail);
      const freshPublic = await loadPublicSourceEvidence(publicSources);
      if (JSON.stringify([...sourceEvidence]) !== JSON.stringify([...freshPrivate]) || !samePublicEvidence(publicEvidence, freshPublic)) throw new SourceGroundingError(undefined, undefined, "changed");
      throwIfAborted(signal);
    } catch (error) {
      const failure = error instanceof SourceGroundingError ? error : new SourceGroundingError();
      const safeEvents = events.filter(event => !["content", "reasoning"].includes(event.type));
      safeEvents.push({ type: "error", message: failure.message, safe_to_display: true, code: failure.code, source_issue: failure.issue });
      throw new AssistantStreamError(failure.message, "", safeEvents.map(sanitizeAssistantEvent), { cause: failure });
    }
    evidenceReleased = true;
    const sourceBound: AssistantEvent = { type: "source_bound_answer", version: 1 };
    events.push(sourceBound);
    unsafeWrite(`data: ${JSON.stringify(sourceBound)}\n\n`);
    // No unverified draft was streamed to the client. Publish the bounded,
    // page-checked result only now; matching quotations is not a merits check.
    for (const chunk of heldOutput) unsafeWrite(chunk);
  }
  devLog("[chat/stream] final citations", {
    hasCitationsBlock: citationDiagnostics.hasBlock,
    citationsBlockLength: citationDiagnostics.rawLength,
    parseError: citationDiagnostics.error,
    parsedCitationCount: parsedCitations.length,
    emittedCitationCount: citations.length,
    usedCustomCitationBuilder: !!buildCitations,
  });
  write(
    `data: ${JSON.stringify({ type: "citations", status: "final", citations })}\n\n`,
  );
  if (params.emitDone !== false) {
    write("data: [DONE]\n\n");
  }

  return {
    fullText,
    events: events.filter(event => !requiresEvidence || event.type !== "reasoning").map(sanitizeAssistantEvent),
    citations,
  };
}
