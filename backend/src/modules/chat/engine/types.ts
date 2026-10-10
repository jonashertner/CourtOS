// Re-exported so the chat modules that already import it from here keep
// working; the definition lives in lib/log.ts.
export { devLog } from "../../../lib/log";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type DocStore = Map<
  string,
  {
    storage_path: string;
    file_type: string;
    filename: string;
    /** Identifies source material that must be copied before it is edited. */
    source_kind?: "document" | "library_template" | "workflow_asset";
    /**
     * Request-scoped plain text that is already available in memory. Inline
     * documents still flow through read_document so their body only reaches
     * the model when it chooses to read them.
     */
    inline_text?: string;
  }
>;

export type WorkflowStore = Map<
  string,
  {
    title: string;
    skill_md: string;
    listed?: boolean;
    assets?: {
      asset_id: string;
      filename: string;
      file_type: string;
      storage_path: string;
    }[];
  }
>;

export type DocIndex = Record<
  string,
  {
    document_id: string;
    filename: string;
    version_id?: string | null;
    version_number?: number | null;
  }
>;

export type TabularCellStore = {
  columns: { index: number; name: string }[];
  documents: { id: string; filename: string }[];
  /** key: `${colIndex}:${docId}` */
  cells: Map<
    string,
    { summary: string; flag?: string; reasoning?: string } | null
  >;
};

export type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: string;
  content: string | null;
  files?: {
    filename: string;
    document_id?: string;
    version_id?: string;
    version_number?: number;
  }[];
  workflow?: { id: string; title: string };
  /**
   * Stored reasoning for an assistant turn, attached server-side by
   * attachPriorReasoning. Never accepted from the request body.
   */
  reasoning?: string;
};

/**
 * Per-quote verification result. `start_char`/`end_char` index into the
 * EXTRACTED source text (not the raw file bytes) and are only present for
 * single-segment quotes that matched.
 */
export type { QuoteVerification } from "@mike/contracts";

// ---------------------------------------------------------------------------
// Doc resolution helpers (used by citations + documentOps)
// ---------------------------------------------------------------------------

export function resolveDoc(rawId: string, docIndex: DocIndex) {
  return Object.hasOwn(docIndex, rawId) ? docIndex[rawId] : undefined;
}

/**
 * Resolve whatever identifier the model passed (`doc-N` slug, filename, or
 * document UUID) back to a chat-local doc label. Aliases must identify exactly
 * one selected source. Never choose the first of duplicate filenames/versions,
 * and never resolve an index entry absent from the request's source store.
 */
export function resolveDocLabel(
  rawId: string,
  docStore: DocStore | undefined,
  docIndex?: DocIndex,
): string | null {
  const labels = docStore ? [...docStore.keys()] : Object.keys(docIndex ?? {});
  if (labels.includes(rawId)) return rawId;
  const matches = labels.filter((label) => {
    const indexed = docIndex ? resolveDoc(label, docIndex) : undefined;
    const filename = docStore?.get(label)?.filename ?? indexed?.filename;
    return filename === rawId || indexed?.document_id === rawId;
  });
  return matches.length === 1 ? matches[0] : null;
}

// ---------------------------------------------------------------------------
// Event / annotation types (shared between toolDispatcher and streaming)
// ---------------------------------------------------------------------------

export type { AskInputOption } from "@mike/contracts";

export const MAX_ASK_INPUT_TEXT_LENGTH = 5_000;
export const MAX_ASK_INPUT_CHOICE_LENGTH = 1_000;
/** What the user sees for a failed tool call; the raw error stays server-side. */
export const TOOL_ERROR_MESSAGE = "This tool could not complete its request.";

export type { AskInputItem } from "@mike/contracts";

export type { AskInputsEvent } from "@mike/contracts";

export type { AskInputResponseItem } from "@mike/contracts";

export type { AskInputsResponseRequest } from "@mike/contracts";

export type { EditAnnotation } from "@mike/contracts";
