import type { CitationCheckFinding, CitationCheckInput, CitationCheckReport, CitationIndexDecision } from "@mike/contracts";
import { checkKnowledgeCitations, MikeApiError } from "./mikeApi";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const statuses = ["found", "differs", "missing", "unchecked"] as const;
/** Existing Citecheck/OpenCaseLaw decision-viewer route; navigation only, never a fetch. */
export function citationIndexDecisionUrl(id: unknown): string | null {
    if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:# -]{0,239}$/.test(id)) return null;
    return `https://mcp.opencaselaw.ch/entscheid/${encodeURIComponent(id)}`;
}
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const text = (value: unknown, max = 1000): value is string => typeof value === "string" && value.length <= max && !/[\u0000\uD800-\uDFFF]/u.test(value);
const strings = (value: unknown, limit = 1000): value is string[] => Array.isArray(value) && value.length <= limit && value.every(item => text(item));
const written = (value: unknown) => value === null || text(value) || (Array.isArray(value) && value.length <= 100 && value.every(item => text(item) || integer(item)));
export class CitationCheckError extends Error {
    constructor(readonly code: "unavailable" | "source" | "scope" | "busy" | "index" | "session" | "changed") { super(code); this.name = "CitationCheckError"; }
}
function validInput(input: CitationCheckInput) {
    return input && Array.isArray(input.sources) && input.sources.length > 0 && input.sources.length <= 5 &&
        input.sources.every(source => UUID.test(source.document_id) && UUID.test(source.version_id)) && new Set(input.sources.map(source => source.document_id.toLowerCase())).size === input.sources.length;
}
function validDecision(value: CitationIndexDecision) {
    return value && text(value.decision_id) && value.decision_id.length > 0 && text(value.label) && text(value.court) && text(value.canton) && (value.date === null || text(value.date, 100)) && strings(value.numbered_sections, 10000);
}
function validFinding(value: CitationCheckFinding, input: CitationCheckInput) {
    const source = value?.source;
    return value && text(value.id, 100) && value.id.length > 0 && source && input.sources.some(item => item.document_id === source.document_id && item.version_id === source.version_id) &&
        text(source.filename, 300) && (source.version_number === null || integer(source.version_number, 1)) && SHA.test(source.pdf_sha256) && SHA.test(source.page_sha256) && integer(source.page, 1) &&
        integer(source.start) && integer(source.end, source.start + 1) && text(source.quote, 1048576) && Array.from(source.quote).length === source.end - source.start &&
        statuses.includes(value.status) && ["not_requested", "not_checked", "exists", "absent", "parent_only", "no_structure"].includes(value.pinpoint) &&
        Array.isArray(value.decisions) && value.decisions.length <= 20 && value.decisions.every(validDecision) && integer(value.decisions_omitted) &&
        Array.isArray(value.issues) && value.issues.length <= 100 && value.issues.every(issue => issue && ["court", "date", "date_invalid", "pinpoint", "page"].includes(issue.kind) && written(issue.written) && strings(issue.listed) && strings(issue.nearby)) &&
        Array.isArray(value.notes) && value.notes.length <= 100 && value.notes.every(note => note && text(note.kind, 100) && written(note.written) && (note.parent === null || text(note.parent))) &&
        Array.isArray(value.suggestions) && value.suggestions.length <= 100 && value.suggestions.every(item => item && text(item.reason, 100) && validDecision(item.decision)) &&
        value.semantic_support === "not_assessed" && value.quoted_decision_wording === "not_checked";
}
/** Reject incomplete or cross-source results; all displayed offsets remain page-local. */
export function parseCitationCheckReport(value: unknown, input: CitationCheckInput): CitationCheckReport {
    const report = value as CitationCheckReport;
    try {
        if (!validInput(input) || !report || report.version !== 1 || !text(report.checked_at, 100) || !Number.isFinite(Date.parse(report.checked_at)) ||
            report.engine?.name !== "citecheck" || !/^[a-f0-9]{40}$/i.test(report.engine.commit) || !report.index || !text(report.index.generated, 100) || !SHA.test(report.index.sha256) ||
            !integer(report.index.decisions) || !integer(report.index.labels) || !integer(report.index.with_numbering) ||
            report.coverage?.documents !== input.sources.length || !integer(report.coverage.pages, 1, 200) || !integer(report.coverage.extracted_text_bytes, 1, 1048576) ||
            report.coverage.complete_selected_extracted_text !== true || report.coverage.all_citation_forms_recognised !== false || report.coverage.images_checked !== false || report.coverage.multiple_pinpoints !== "first_only" ||
            report.semantic_support !== "not_assessed" || !Array.isArray(report.findings) || report.findings.length > 500 || report.findings.some(finding => !validFinding(finding, input)) ||
            new Set(report.findings.map(finding => finding.id)).size !== report.findings.length || !report.counts ||
            statuses.some(status => !integer(report.counts[status]) || report.counts[status] !== report.findings.filter(finding => finding.status === status).length)) throw new Error();
        return report;
    } catch { throw new CitationCheckError("unavailable"); }
}
export async function checkCitations(input: CitationCheckInput, signal?: AbortSignal): Promise<CitationCheckReport> {
    if (!validInput(input)) throw new CitationCheckError("scope");
    try { return parseCitationCheckReport(await checkKnowledgeCitations(input, signal), input); }
    catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof CitationCheckError) throw error;
        if (error instanceof MikeApiError) {
            const code = error.code;
            throw new CitationCheckError(error.status === 401 ? "session" : code === "citation_index_unavailable" ? "index" : code === "citation_check_scope" || code === "citation_check_invalid" ? "scope" : code === "citation_check_busy" || error.status === 429 ? "busy" : code === "citation_check_source_changed" || error.status === 409 ? "changed" : code === "citation_check_source_unavailable" || error.status === 403 ? "source" : "unavailable");
        }
        throw new CitationCheckError("unavailable");
    }
}
