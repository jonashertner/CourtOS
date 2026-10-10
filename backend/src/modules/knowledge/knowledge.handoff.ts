import { z } from "zod";
import type { ResearchHandoffMetadata, ResearchHandoffRecord, ResearchHandoffState } from "@mike/contracts";
import type { Db } from "../../lib/supabase";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = z.string().regex(UUID);
const integer = (max: number, min = 0) => z.number().int().min(min).max(max);
const text = (max: number) => z.string().max(max).refine(value => !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value));
const nullable = (max: number) => text(max).nullable();
const url = text(2048).refine(value => {
  try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password; }
  catch { return false; }
}).nullable();
const decision = z.object({
  decision_id: text(240).regex(/^[A-Za-z0-9][A-Za-z0-9_.:# \-]{0,239}$/),
  court: nullable(200), canton: nullable(20), docket_number: nullable(300), decision_date: nullable(40),
  language: nullable(20), title: nullable(1000), source_url: url, pdf_url: url,
  content_hash: nullable(200), scraped_at: nullable(100), date_is_estimated: z.boolean().nullable().optional(),
  source_note: nullable(2000).optional(), snippet: text(2000),
}).strict();
const publicResults = z.object({
  results: z.array(decision).max(5), query_mode: z.enum(["literal_terms", "opencaselaw_ai"]),
  ai_assisted: z.boolean().optional(), degraded: z.boolean().optional(),
  database_generation: z.union([text(200), integer(Number.MAX_SAFE_INTEGER), z.null()]),
  ranking: text(120).optional(), candidate_limit: integer(4096, 1).optional(), candidates_examined: integer(4096).optional(),
}).strict();
const excerpt = z.object({
  text: text(1600).refine(value => Array.from(value).length >= 20 && Array.from(value).length <= 800),
  start: integer(20_000_000), end: integer(20_000_000), total_chars: integer(20_000_000),
}).strict().refine(value => value.end <= value.total_chars && value.end - value.start === Array.from(value.text).length);
const publicSource = z.object({ decision, start: integer(20_000_000), history: z.array(integer(20_000_000)).max(32), excerpt: excerpt.nullable() }).strict()
  .refine(value => !value.excerpt || (value.excerpt.start >= value.start && value.excerpt.end <= value.start + 4000));
const privateResult = z.object({
  document_id: id, version_id: id, version_number: integer(1_000_000, 1).nullable(),
  filename: text(300), page: integer(99999, 1), quote: text(3000), score: z.number().finite(),
}).strict();
const privateResults = z.object({
  results: z.array(privateResult).max(12),
  documents: z.array(z.object({ document_id: id, version_id: id, index_status: z.enum(["ready", "partial", "unreadable"]), indexed_pages: integer(99999), total_pages: integer(99999) }).strict()).max(20),
  notices: z.array(text(1000)).max(20),
}).strict();
const selected = z.object({
  id, filename: text(300), file_type: nullable(80), active_version_id: id.nullable(),
  active_version_number: integer(1_000_000, 1).nullable(), size_bytes: integer(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();
const stateSchema = z.object({
  version: z.literal(1), mode: z.enum(["public", "private"]),
  conversation: z.object({ chat_id: id.nullable(), draft: text(12000) }).strict().optional(),
  public: z.object({ query: text(180), submitted: text(180), language: z.enum(["", "de", "fr", "it"]), result: publicResults.nullable(), source: publicSource.nullable() }).strict(),
  private: z.object({ query: text(300), submitted: text(300), selected: z.array(selected).max(20), result: privateResults.nullable(), source: privateResult.nullable() }).strict(),
}).strict().refine(value => new Set(value.private.selected.map(document => document.id.toLowerCase())).size === value.private.selected.length);

/** Cached display state is untrusted. It contains no executable action, credential,
 * verification flag or full document. Restored sources must be fetched again. */
export function parseResearchHandoffState(value: unknown): ResearchHandoffState | null {
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 65536) return null;
    const parsed = stateSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

type HandoffAction =
  | { action: "create"; state: unknown }
  | { action: "read"; id: string; metadataOnly: boolean }
  | { action: "update"; id: string; expectedRevision: number; state: unknown; direction: "to_browser" | "to_word" }
  | { action: "ack"; id: string; expectedRevision: number };
const invalid = () => failure("validation", "Der Recherchekontext ist ungültig oder zu gross.", "handoff_invalid");
const unavailable = () => failure("unavailable", "Der Recherchekontext ist gerade nicht verfügbar. Bitte erneut versuchen.", "handoff_unavailable");
async function ownsConversation(db: Db, userId: string, state: ResearchHandoffState): Promise<boolean> {
  const chatId = state.conversation?.chat_id;
  if (!chatId) return true;
  const { data, error } = await db.from("chats").select("id").eq("id", chatId).eq("user_id", userId).is("project_id", null).is("org_id", null).maybeSingle();
  return !error && !!data && typeof data.id === "string" && data.id.toLowerCase() === chatId.toLowerCase();
}

/** The RPC atomically owns expiry, access revalidation, capacity and revision CAS.
 * Never log database errors here: database errors can contain a supplied row. */
export async function researchHandoff(db: Db, userId: string, input: HandoffAction): Promise<ServiceResult<ResearchHandoffMetadata | ResearchHandoffRecord>> {
  if (!UUID.test(userId) || ("id" in input && !UUID.test(input.id))) return invalid();
  if ("expectedRevision" in input && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision > 32)) return invalid();
  if (input.action === "update" && !["to_word", "to_browser"].includes(input.direction)) return invalid();
  const state = "state" in input ? parseResearchHandoffState(input.state) : null;
  if ("state" in input && !state) return invalid();
  try {
    if (state && !(await ownsConversation(db, userId, state))) return failure("not_found", "Dieser Recherchekontext ist für Ihr Konto nicht verfügbar.", "handoff_not_found");
    const { data, error } = await db.rpc("courtos_research_handoff", {
      p_user_id: userId, p_action: input.action, p_id: "id" in input ? input.id : null,
      p_expected_revision: "expectedRevision" in input ? input.expectedRevision : null,
      p_state: state, p_direction: input.action === "update" ? input.direction : null,
      // Chat-reference access is checked below even for metadata polls; the
      // transcript is never copied and its own GET still performs access checks.
      p_metadata_only: false,
    });
    if (error || !data || typeof data !== "object") return unavailable();
    if (data.status === "not_found") return failure("not_found", "Dieser Recherchekontext ist abgelaufen oder für Ihr Konto nicht verfügbar.", "handoff_not_found");
    if (data.status === "conflict") return failure("conflict", "Die Recherche wurde im anderen Fenster geändert. Bitte zuerst den aktuellen Stand laden.", "handoff_conflict");
    if (data.status === "limit") return failure("conflict", "Derzeit sind zu viele vorübergehende Recherchekontexte geöffnet. Bitte später erneut versuchen.", "handoff_limit");
    if (data.status === "revision_limit") return failure("conflict", "Bitte für diese Recherche einen neuen Fensterwechsel beginnen.", "handoff_revision_limit");
    if (data.status === "invalid") return invalid();
    const record = data.record as Record<string, unknown> | undefined;
    if (data.status !== "ok" || !record || !UUID.test(String(record.id)) ||
      ("id" in input && String(record.id).toLowerCase() !== input.id.toLowerCase()) ||
      !Number.isInteger(record.revision) || Number(record.revision) < 1 || Number(record.revision) > 32 ||
      !Number.isInteger(record.acknowledged_revision) || Number(record.acknowledged_revision) < 0 || Number(record.acknowledged_revision) > Number(record.revision) ||
      !["to_word", "to_browser"].includes(String(record.direction)) || typeof record.expires_at !== "string" || !Number.isFinite(Date.parse(record.expires_at))) return unavailable();
    const metadata: ResearchHandoffMetadata = { id: String(record.id), revision: Number(record.revision), expires_at: record.expires_at, direction: record.direction as ResearchHandoffMetadata["direction"], acknowledged_revision: Number(record.acknowledged_revision) };
    if (input.action === "read") {
      const saved = parseResearchHandoffState(record.state);
      if (!saved) return unavailable();
      if (!(await ownsConversation(db, userId, saved))) return failure("not_found", "Dieser Recherchekontext ist für Ihr Konto nicht verfügbar.", "handoff_not_found");
      return ok(input.metadataOnly ? metadata : { ...metadata, state: saved });
    }
    return ok(metadata);
  } catch { return unavailable(); }
}
