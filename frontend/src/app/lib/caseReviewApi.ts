import type { CaseReviewInput, CaseReviewRecord, CaseReviewSource } from "@mike/contracts";
import { authenticatedFetch } from "./authEvents";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const statuses = new Set(["queued", "reading", "analysing", "checking", "completed", "failed", "cancelled", "interrupted"]);
export const isReviewActive = (record: CaseReviewRecord | null) => !!record && ["queued", "reading", "analysing", "checking"].includes(record.status);
export class CaseReviewError extends Error {
    constructor(readonly code: "unavailable" | "source" | "input" | "quota" | "conflict" | "session" | "grounding" | "output" | "context" | "missing", readonly rejected = false) { super(code); this.name = "CaseReviewError"; }
}
function validSource(source: CaseReviewSource, input: CaseReviewInput) {
    return source && source.source_match === "exact" && input.sources.some(item => item.document_id === source.document_id && item.version_id === source.version_id) &&
        Number.isSafeInteger(source.page) && source.page >= 1 && typeof source.quote === "string" && source.quote.length > 0 && source.quote.length <= 800 &&
        Number.isSafeInteger(source.start) && Number.isSafeInteger(source.end) && source.start >= 0 && source.end > source.start &&
        /^[a-f0-9]{64}$/.test(source.pdf_sha256) && /^[a-f0-9]{64}$/.test(source.page_sha256) && typeof source.filename === "string" && source.filename.length <= 300 && source.end - source.start === Array.from(source.quote).length;
}
/** Reject malformed reports; never render a half-parsed or unbound source result. */
export function parseCaseReviewRecord(value: unknown, expectedId: string): CaseReviewRecord {
    const record = value as CaseReviewRecord;
    try {
        if (!record || record.id !== expectedId || !UUID.test(record.id) || !statuses.has(record.status) || !record.input || record.input.request_id !== record.id ||
            !["facts", "legal", "chronology"].includes(record.input.kind) || !["de", "fr", "it", "en"].includes(record.input.language) ||
            !Array.isArray(record.input.sources) || record.input.sources.length < 1 || record.input.sources.length > 5 ||
            record.input.sources.some(source => !UUID.test(source.document_id) || !UUID.test(source.version_id) || !["claim", "response", "exhibit", "authority", "other"].includes(source.role))) throw new Error();
        if (record.status === "completed") {
            const report = record.report;
            if (!report || report.version !== 1 || report.kind !== record.input.kind || report.language !== record.input.language || report.processing !== "courtos_server_germany" ||
                !Array.isArray(report.rows) || report.rows.length > 12 || !report.coverage || report.coverage.complete_selected_text !== true || report.coverage.all_claims_extracted !== false ||
                report.coverage.external_legal_research_performed !== false || !Array.isArray(report.coverage.selection) || report.coverage.selection.length !== record.input.sources.length || !Array.isArray(report.notices) ||
                typeof report.coverage.more_claims_reported !== "boolean" || typeof report.model !== "string" || report.model.length > 200) throw new Error();
            const seen = new Set<string>();
            for (const item of report.coverage.selection) {
                const key = `${item.document_id}:${item.version_id}`;
                if (seen.has(key) || !record.input.sources.some(source => source.document_id === item.document_id && source.version_id === item.version_id) ||
                    typeof item.filename !== "string" || !Array.isArray(item.pages) || item.pages.length > 40 || item.pages.some(page => !Number.isInteger(page) || page < 1)) throw new Error();
                seen.add(key);
            }
            let lastDate = "", undated = false;
            for (const row of report.rows) {
                if (!["exact_day", "ambiguous", "undated"].includes(row.date_status) || (row.date_status === "exact_day" ? !row.date || typeof row.date_sort !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_sort) : row.date_sort !== null)) throw new Error();
                if (report.kind === "chronology") {
                    if (row.date_status === "exact_day") { if (undated || row.date_sort! < lastDate) throw new Error(); lastDate = row.date_sort!; } else undated = true;
                }
                if (typeof row.id !== "string" || !["claim", "response", "exhibit", "authority", "other"].includes(row.source_role) || (row.party_label !== null && typeof row.party_label !== "string") || !validSource(row.proposition, record.input) || !["fact", "legal"].includes(row.category) || !["supports", "contradicts", "inconclusive", "not_found"].includes(row.assessment) ||
                    !["allegation", "denial", "document_statement", "legal_argument", "unresolved"].includes(row.posture) || row.assessment_basis !== "selected_sources_only" || row.semantic_status !== "ai_draft_requires_review" ||
                    typeof row.reasoning !== "string" || row.reasoning.length > 500 || (row.date !== null && !validSource(row.date, record.input))) throw new Error();
                for (const field of [row.amounts, row.evidence, row.opposing_position, row.cited_references]) if (!Array.isArray(field) || field.length > 3 || field.some(source => !validSource(source, record.input))) throw new Error();
            }
        } else if (record.report !== null) throw new Error();
        return record;
    } catch { throw new CaseReviewError("unavailable"); }
}
async function request(path: string, id: string, init: RequestInit): Promise<CaseReviewRecord> {
    if (!UUID.test(id)) throw new CaseReviewError("input");
    let response: Response;
    try { response = await authenticatedFetch(`/api/knowledge/reviews${path}`, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", Accept: "application/json" } }); }
    catch { throw new CaseReviewError("unavailable"); }
    if (!response.ok) {
        let code = ""; try { const body = await response.json(); code = typeof body.code === "string" ? body.code : ""; } catch { /* Fixed safe fallback. */ }
        throw new CaseReviewError(response.status === 401 ? "session" : response.status === 404 && init.method === "GET" ? "missing" : response.status === 403 || response.status === 404 ? "source" : response.status === 409 ? "conflict" : response.status === 429 ? "quota" : code === "review_context_unavailable" ? "context" : code === "review_grounding_failed" ? "grounding" : code === "review_invalid_output" ? "output" : response.status === 400 || response.status === 422 ? "input" : "unavailable", response.status >= 400 && response.status < 500);
    }
    return parseCaseReviewRecord(await response.json(), id);
}
export const startCaseReview = (input: CaseReviewInput) => request("", input.request_id, { method: "POST", body: JSON.stringify(input) });
export const getCaseReview = (id: string, signal?: AbortSignal) => request(`/${id}`, id, { method: "GET", signal });
export const stopCaseReview = (id: string) => request(`/${id}/stop`, id, { method: "POST", body: "{}" });

const KEY = "courtos:review-reference:v1:";
export function rememberCaseReview(owner: string, id: string): void {
    if (!owner || !UUID.test(id)) return;
    try { sessionStorage.setItem(KEY + owner, JSON.stringify({ owner, id })); } catch { /* Current window remains usable without storage. */ }
}
export function savedCaseReview(owner: string): string | null {
    try { const value = JSON.parse(sessionStorage.getItem(KEY + owner) ?? "null"); return value?.owner === owner && UUID.test(value.id) ? value.id : null; } catch { return null; }
}
export function clearCaseReview(owner: string): void { try { sessionStorage.removeItem(KEY + owner); } catch { /* Optional storage. */ } }
