import type { Db } from "../../lib/supabase";
import { failure, internalFailure, ok, type ServiceResult } from "../../lib/serviceResult";
import { downloadFile, headFile } from "../../lib/storage";
import { readPdfPages, type PdfPageText } from "../../lib/pdfText";
import { courtosKnowledgeEnabled, KNOWLEDGE_MAX_DOCUMENTS, KNOWLEDGE_MAX_PAGES, KNOWLEDGE_MAX_CHARS, KNOWLEDGE_MAX_PDF_BYTES } from "../../lib/courtosKnowledge";

type IndexMetadata = { index_status: "ready" | "partial" | "unreadable"; indexed_pages: number; total_pages: number; indexed_at: string };
type Version = { id: string; document_id: string; storage_path: string | null; pdf_storage_path: string | null; content_sha256: string | null; file_type: string | null; filename: string; version_number: number | null; courtos_knowledge_index: IndexMetadata | null };
export type KnowledgeResult = { document_id: string; version_id: string; version_number: number | null; filename: string; page: number; quote: string; score: number };
export type KnowledgeSearch = { results: KnowledgeResult[]; documents: Array<IndexMetadata & { document_id: string; version_id: string }>; notices: string[] };
export type KnowledgeInput = { query: string; document_ids: string[]; limit: number };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseKnowledgeInput(body: unknown): KnowledgeInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(k => !["query","document_ids","limit"].includes(k))) return null;
  if (typeof b.query !== "string" || !b.query.trim() || b.query.length > 300) return null;
  if (!Array.isArray(b.document_ids) || !b.document_ids.length || b.document_ids.length > KNOWLEDGE_MAX_DOCUMENTS || b.document_ids.some(id => typeof id !== "string" || !UUID.test(id))) return null;
  if (new Set(b.document_ids).size !== b.document_ids.length) return null;
  const limit = b.limit ?? 10;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 20) return null;
  return { query: b.query.trim(), document_ids: b.document_ids as string[], limit: Number(limit) };
}

/** Exact, page-local substrings; never join material across page boundaries. */
export function knowledgePassages(pages: PdfPageText[], maxBytes = 500_000): Array<{ page: number; quote: string }> {
  const passages: Array<{ page: number; quote: string }> = [];
  let remainingBytes = maxBytes;
  for (const page of pages) {
    if (page.empty) continue;
    const text = page.text.replace(/^\[Page \d+\]\n/, "");
    for (let start = 0; start < text.length && passages.length < 400; start += 1400) {
      // Avoid splitting a Unicode surrogate pair: every quote must remain an
      // exact substring after UTF-8 storage and native citation verification.
      const beginsInsidePair = start > 0 && /[\uDC00-\uDFFF]/.test(text[start]) && /[\uD800-\uDBFF]/.test(text[start - 1]);
      const from = beginsInsidePair ? start + 1 : start;
      let end = Math.min(from + 1600, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
      const candidate = text.slice(from, end);
      let quote = "";
      for (const character of candidate) {
        const bytes = Buffer.byteLength(character, "utf8");
        if (bytes > remainingBytes) break;
        quote += character; remainingBytes -= bytes;
      }
      if (quote.trim()) passages.push({ page: page.page, quote });
      if (Buffer.byteLength(quote, "utf8") < Buffer.byteLength(candidate, "utf8")) return passages;
    }
  }
  return passages;
}
const indexing = new Map<string, Promise<IndexMetadata | null>>();
async function indexVersion(db: Db, userId: string, version: Version): Promise<IndexMetadata | null> {
  const key = JSON.stringify([userId, version.id, version.storage_path, version.pdf_storage_path, version.content_sha256]);
  const existing = indexing.get(key);
  if (existing) return existing;
  if (indexing.size >= 2) return null;
  const work = (async () => {
    const path = version.file_type?.toLowerCase() === "pdf" ? version.storage_path : version.pdf_storage_path;
    let pages: PdfPageText[] | null = null;
    if (path) {
      const head = await headFile(path);
      if (head && head.size > 0 && head.size <= KNOWLEDGE_MAX_PDF_BYTES) {
        const bytes = await downloadFile(path);
        if (bytes && bytes.byteLength <= KNOWLEDGE_MAX_PDF_BYTES) pages = await readPdfPages(bytes, KNOWLEDGE_MAX_PAGES, KNOWLEDGE_MAX_CHARS);
      }
    }
    const passages = knowledgePassages(pages ?? []);
    const passageBytes = knowledgePassages(pages ?? [], Infinity).reduce((n, p) => n + Buffer.byteLength(p.quote, "utf8"), 0);
    const metadata: IndexMetadata = {
      index_status: !pages?.length || pages.every(p => p.empty) ? "unreadable" : pages.some(p => p.empty || p.truncated) || passageBytes > 500_000 ? "partial" : "ready",
      indexed_pages: new Set(passages.map(p => p.page)).size,
      total_pages: pages?.[0]?.totalPages ?? 0,
      indexed_at: new Date().toISOString(),
    };
    const { data, error } = await db.rpc("courtos_store_knowledge_index", {
      p_user_id: userId, p_document_id: version.document_id, p_version_id: version.id,
      p_storage_path: version.storage_path, p_pdf_storage_path: version.pdf_storage_path, p_content_sha256: version.content_sha256,
      p_metadata: metadata, p_passages: passages,
    });
    if (error) throw error;
    return data && typeof data === "object" && data.stored === true ? data.metadata as IndexMetadata : null;
  })();
  indexing.set(key, work);
  try { return await work; } finally { indexing.delete(key); }
}

export async function searchKnowledge(db: Db, userId: string, input: KnowledgeInput, selectedAttachmentsOnly = false): Promise<ServiceResult<KnowledgeSearch>> {
  if (!courtosKnowledgeEnabled()) return failure("not_found", "Wissensbasis nicht aktiviert.");
  const parsed = parseKnowledgeInput(input);
  if (!parsed) return failure("validation", "Bitte einen Suchtext bis 300 Zeichen und 1 bis 20 eigene Bibliotheksdateien auswählen.");
  try {
    // Scope BEFORE loading version metadata, reading storage, indexing or ranking.
    const { data: documents, error } = await db.from("documents").select("id,current_version_id")
      .eq("user_id", userId).is("project_id", null).is("org_id", null).is("workflow_id", null)
      .eq("library_kind", "file").eq("status", "ready").in("id", parsed.document_ids);
    if (error) return internalFailure(error);
    const docs = (documents ?? []) as Array<{ id: string; current_version_id: string | null }>;
    if (!selectedAttachmentsOnly && docs.length !== parsed.document_ids.length) return failure("not_found", "Eine ausgewählte Bibliotheksdatei ist nicht verfügbar.");
    if (!docs.length) return ok({ results: [], documents: [], notices: ["Keine eigenen Bibliotheksdateien in dieser Auswahl verfügbar."] });
    const ids = docs.flatMap(d => d.current_version_id ? [d.current_version_id] : []);
    const { data: versionData, error: versionError } = await db.from("document_versions")
      .select("id,document_id,storage_path,pdf_storage_path,content_sha256,file_type,filename,version_number,courtos_knowledge_index")
      .in("id", ids).is("deleted_at", null);
    if (versionError) return internalFailure(versionError);
    const versions = (versionData ?? []) as Version[];
    const statuses: KnowledgeSearch["documents"] = [];
    for (const version of versions) {
      if (!docs.some(d => d.id === version.document_id && d.current_version_id === version.id)) continue;
      const metadata = version.courtos_knowledge_index ?? await indexVersion(db, userId, version);
      if (!metadata) return failure("conflict", "Der Bestand wird gerade aktualisiert oder indexiert. Bitte kurz warten und erneut suchen.");
      statuses.push({ document_id: version.document_id, version_id: version.id, ...metadata });
    }
    // The SQL function repeats ownership, current version and live-status gates.
    const { data, error: searchError } = await db.rpc("courtos_search_knowledge", {
      p_user_id: userId, p_document_ids: docs.map(d => d.id), p_query: parsed.query, p_limit: parsed.limit,
    });
    if (searchError) return internalFailure(searchError);
    return ok({ results: (data ?? []) as KnowledgeResult[], documents: statuses, notices: [
      "Lokale Wort-/Phrasensuche im ausgewählten Bestand; kein vollständiger Nachweis der Rechtslage.",
      ...(statuses.some(s => s.index_status !== "ready") ? ["Mindestens eine Datei ist nur teilweise oder nicht durchsuchbar (Scan, fehlende PDF-Fassung oder Pilotgrenze: 200 Seiten, 250000 Zeichen, 500000 Passagebytes je Datei; Indexbudget 8 MiB je Konto/64 MiB global). Fehlende Treffer belegen keine Abwesenheit."] : []),
    ] });
  } catch (error) { return internalFailure(error); }
}
