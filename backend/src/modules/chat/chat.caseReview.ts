import { randomUUID } from "node:crypto";
import type { Db } from "../../lib/supabase";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";
import { prefetchSourceEvidence, SourceGroundingError, type SourceEvidenceProfile } from "./engine/sourceEvidence";
import type { DocIndex, DocStore } from "./engine/types";

/** Personal, exact-version sources only. Request filenames/paths are ignored. */
export async function loadCaseReviewEvidence(db: Db, userId: string, selected: Array<{ document_id: string; version_id: string }>, profile: SourceEvidenceProfile = "model") {
  const { data, error } = await db.from("documents").select("id,current_version_id")
    .eq("user_id", userId).eq("status", "ready").eq("library_kind", "file")
    .is("project_id", null).is("org_id", null).is("workflow_id", null)
    .in("id", selected.map(source => source.document_id));
  if (error || !data || data.length !== selected.length) throw new SourceGroundingError("Eine ausgewählte eigene Quelle ist nicht verfügbar. Es wurde keine Modellanfrage gestartet.");
  // A previously selected immutable version remains valid after a newer version
  // is uploaded. The report keeps that explicit version, never substitutes it.
  const store: DocStore = new Map();
  const index: DocIndex = {};
  selected.forEach((source, i) => {
    const label = `doc-${i}`;
    store.set(label, { storage_path: "", file_type: "pdf", filename: "" });
    index[label] = { document_id: source.document_id, version_id: source.version_id, filename: "" };
  });
  const result = await prefetchSourceEvidence(store, index, db, userId, undefined, profile);
  // Repeat owner scope after the awaited PDF work. A moved/deleted source cannot
  // be released to inference merely because it was owned at the initial query.
  const { data: current, error: currentError } = await db.from("documents").select("id")
    .eq("user_id", userId).eq("status", "ready").eq("library_kind", "file")
    .is("project_id", null).is("org_id", null).is("workflow_id", null)
    .in("id", selected.map(source => source.document_id));
  if (currentError || !current || current.length !== selected.length) throw new SourceGroundingError("Die Quellenauswahl hat sich geändert. Es wurde keine Modellanfrage gestartet.");
  return [...result.values()];
}

const unavailable = () => failure("unavailable", "Der Prüfbericht konnte nicht sicher gespeichert werden. Es wurde kein Ergebnis freigegeben.", "review_storage_unavailable");
const missing = () => failure("not_found", "Dieser Prüfbericht ist für das angemeldete Konto nicht verfügbar.", "review_not_found");
const MARKER = "courtos_case_review_v1";

/** Existing personal-chat deletion/export lifecycle; no new durable container. */
export async function createCaseReviewRecord(db: Db, userId: string, id: string, model: string, record: Record<string, unknown>): Promise<ServiceResult<{ messageId: string }>> {
  const { error: chatError } = await db.from("chats").insert({ id, user_id: userId, project_id: null, org_id: null, title: "Eingaben prüfen · Teilanalyse", model });
  if (chatError) return unavailable();
  const messageId = randomUUID();
  const { error } = await db.from("chat_messages").insert({
    id: messageId, chat_id: id, author_user_id: userId, role: "assistant",
    content: [{ type: "content", text: "Prüfbericht in Bearbeitung. Quellengebundene Teilanalyse zur persönlichen Prüfung." }, { type: MARKER, record }],
    citations: [], memory_eligible_at: null, memory_app_eligible_at: null,
  });
  // Never delete the freshly created container on an uncertain insert outcome.
  return error ? unavailable() : ok({ messageId });
}

export async function readCaseReviewRecord(db: Db, userId: string, id: string): Promise<ServiceResult<{ messageId: string; record: Record<string, unknown> }>> {
  const { data: chat, error: chatError } = await db.from("chats").select("id")
    .eq("id", id).eq("user_id", userId).is("project_id", null).is("org_id", null).maybeSingle();
  if (chatError) return unavailable();
  if (!chat) return missing();
  const { data, error } = await db.from("chat_messages").select("id,content")
    .eq("chat_id", id).eq("author_user_id", userId).eq("role", "assistant")
    .order("created_at", { ascending: true }).limit(2);
  if (error) return unavailable();
  const rows = (data ?? []) as Array<{ id: string; content: unknown }>;
  for (const row of rows) {
    if (!Array.isArray(row.content)) continue;
    const saved = row.content.find(value => value && typeof value === "object" && value.type === MARKER);
    if (saved && saved.record && typeof saved.record === "object" && !Array.isArray(saved.record) && saved.record.id === id) return ok({ messageId: row.id, record: saved.record });
  }
  return missing();
}

export async function writeCaseReviewRecord(db: Db, userId: string, id: string, record: Record<string, unknown>): Promise<ServiceResult<null>> {
  const existing = await readCaseReviewRecord(db, userId, id);
  if (!existing.ok) return existing;
  const complete = record.status === "completed";
  const { data, error } = await db.from("chat_messages").update({
    content: [{ type: "content", text: complete
      ? "Quellengebundene Teilanalyse gespeichert. Die gefundenen Textstellen und die KI-Einschätzungen sind im Prüfbericht getrennt dargestellt. Keine Zusicherung der Vollständigkeit oder Richtigkeit."
      : "Prüfbericht: " + ({ reading: "Quellen werden gelesen.", analysing: "KI-Teilanalyse läuft.", checking: "Fundstellen werden abgeglichen.", failed: "Die Teilanalyse wurde nicht freigegeben.", cancelled: "Auftrag abgebrochen.", interrupted: "Auftrag unterbrochen; keine automatische Wiederholung." }[String(record.status)] ?? "In Bearbeitung.") }, { type: MARKER, record }],
    citations: [], memory_eligible_at: null, memory_app_eligible_at: null,
  }).eq("id", existing.data.messageId).eq("chat_id", id).eq("author_user_id", userId).select("id");
  return error || !data || data.length !== 1 ? unavailable() : ok(null);
}
