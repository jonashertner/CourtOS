import { z } from "zod";
import type { CitationCheckReport, CitationCheckFinding, CitationIndexDecision, FormalCitationStatus } from "@mike/contracts";
import type { Db } from "../../lib/supabase";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";
import { courtosKnowledgeEnabled } from "../../lib/courtosKnowledge";
import { CITECHECK_COMMIT, citationIndexManifest, CitationIndexUnavailable, loadCitationIndex } from "../../lib/citecheck";
import { checkDocument } from "../../lib/citecheck/vendor/check";
import { loadCaseReviewEvidence } from "../chat/chat.service";

const inputSchema = z.object({ sources: z.array(z.object({ document_id: z.string().uuid(), version_id: z.string().uuid() }).strict()).min(1).max(5) }).strict()
  .refine(value => new Set(value.sources.map(source => source.document_id.toLowerCase())).size === value.sources.length);
type Evidence = Awaited<ReturnType<typeof loadCaseReviewEvidence>>;
type IndexRow = { id: string; key: string; court: string; canton: string; date: string; enums: string[] };
type RawFinding = {
  paragraph: number; start: number; end: number; text: string; status: FormalCitationStatus; rows: IndexRow[];
  issues: Array<{ kind: "court" | "date" | "date_invalid" | "pinpoint" | "page"; written?: string | number[]; named?: string[]; listed?: string[]; nearby?: string[] }>;
  notes: Array<{ kind: string; written?: string | number[]; parent?: string }>;
  parsed?: { pinpoint?: string } | null;
  suggestions?: Array<{ reason: string; row: IndexRow }>;
};
const decision = (row: IndexRow): CitationIndexDecision => ({ decision_id: row.id, label: row.key, court: row.court, canton: row.canton, date: row.date || null, numbered_sections: row.enums });
class CitationCheckScopeError extends Error {}
let activeChecks = 0;

/** Explicit UTF-16 → Unicode-codepoint conversion; rejects half-surrogate anchors. */
export function citationCodepointRange(text: string, start: number, end: number): { start: number; end: number; quote: string } {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length || /[\uD800-\uDFFF]/u.test(text)) throw new Error("citation_span");
  const quote = text.slice(start, end);
  if (/[\uD800-\uDFFF]/u.test(quote) || /[\uD800-\uDFFF]/u.test(text.slice(0, start))) throw new Error("citation_span");
  return { start: Array.from(text.slice(0, start)).length, end: Array.from(text.slice(0, end)).length, quote };
}

/** Private text enters only the pinned pure engine. No network, model or storage writes. */
export function formalCitationFindings(sources: Evidence, index: Awaited<ReturnType<typeof loadCitationIndex>>): CitationCheckFinding[] {
  const pages = sources.flatMap(source => source.pages.map(page => ({ source, page })));
  const checked = checkDocument(pages.map(({page}, i) => ({ text: page.text, where: i })), index);
  if (checked.findings.length > 500) throw new CitationCheckScopeError();
  return (checked.findings as RawFinding[]).map((finding, i) => {
    const selected = pages[finding.paragraph];
    if (!selected) throw new Error("citation_span");
    const { source, page } = selected;
    const span = citationCodepointRange(page.text, finding.start, finding.end);
    if (span.quote !== finding.text) throw new Error("citation_span");
    return {
      id: `citation-${i + 1}`,
      source: { document_id: source.document_id, version_id: source.version_id, version_number: source.version_number, filename: source.filename, pdf_sha256: source.pdf_sha256, page_sha256: page.sha256, page: page.page, ...span },
      status: finding.status,
      pinpoint: !finding.parsed?.pinpoint ? "not_requested" : !finding.rows.length || finding.issues.some(issue => issue.kind === "court") ? "not_checked" : finding.issues.some(issue => issue.kind === "pinpoint") ? "absent" : finding.notes.some(note => note.kind === "pinpoint_no_structure") ? "no_structure" : finding.notes.some(note => note.kind === "pinpoint_parent_only") ? "parent_only" : "exists",
      decisions: finding.rows.slice(0, 20).map(decision), decisions_omitted: Math.max(0, finding.rows.length - 20),
      issues: finding.issues.map(issue => ({ kind: issue.kind, written: issue.written ?? issue.named ?? null, listed: issue.listed ?? [], nearby: issue.nearby ?? [] })),
      notes: finding.notes.map(note => ({ kind: note.kind, written: note.written ?? null, parent: note.parent ?? null })),
      suggestions: (finding.suggestions ?? []).map(suggestion => ({ reason: suggestion.reason, decision: decision(suggestion.row) })),
      semantic_support: "not_assessed", quoted_decision_wording: "not_checked",
    };
  });
}

export async function checkSelectedCitations(db: Db, userId: string, raw: unknown): Promise<ServiceResult<CitationCheckReport>> {
  if (!courtosKnowledgeEnabled()) return failure("not_found", "Diese Prüfung ist nicht verfügbar.", "citation_check_unavailable");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return failure("validation", "Bitte 1 bis 5 eigene PDF-Fassungen auswählen.", "citation_check_invalid");
  if (activeChecks >= 2) return failure("unavailable", "Die Zitatprüfung ist ausgelastet. Bitte kurz warten.", "citation_check_busy");
  activeChecks++;
  try {
    const index = await loadCitationIndex();
    // Shared facade admits only ready personal-library originals, verifies actual
    // PDF/version hashes, all pages, aggregate bounds and owner scope twice.
    const sources = await loadCaseReviewEvidence(db, userId, parsed.data.sources, "citation_check");
    const findings = formalCitationFindings(sources, index);
    // Recheck the exact versions and ownership immediately before release.
    const current = await loadCaseReviewEvidence(db, userId, parsed.data.sources, "citation_check");
    if (JSON.stringify(current) !== JSON.stringify(sources)) return failure("conflict", "Eine ausgewählte Quelle hat sich geändert. Bitte erneut prüfen.", "citation_check_source_changed");
    const counts: Record<FormalCitationStatus, number> = { found: 0, differs: 0, missing: 0, unchecked: 0 };
    findings.forEach(finding => { counts[finding.status]++; });
    return ok({ version: 1, checked_at: new Date().toISOString(), engine: { name: "citecheck", commit: CITECHECK_COMMIT },
      index: { generated: citationIndexManifest.generated, sha256: citationIndexManifest.sha256, decisions: citationIndexManifest.decisions, labels: citationIndexManifest.labels, with_numbering: citationIndexManifest.with_numbering },
      coverage: { documents: sources.length, pages: sources.reduce((n, source) => n + source.pages.length, 0), extracted_text_bytes: sources.reduce((n, source) => n + source.pages.reduce((size, page) => size + Buffer.byteLength(page.text, "utf8"), 0), 0), complete_selected_extracted_text: true, all_citation_forms_recognised: false, images_checked: false, multiple_pinpoints: "all" },
      counts, findings, semantic_support: "not_assessed" });
  } catch (error) {
    if (error instanceof CitationCheckScopeError) return failure("validation", "Die Auswahl enthält mehr als 500 erkannte Zitate. Bitte einen kleineren Teilbestand auswählen. Es wurde kein Teilergebnis freigegeben.", "citation_check_scope");
    if (error instanceof CitationIndexUnavailable) return failure("unavailable", "Die geprüfte öffentliche Zitatliste ist noch nicht verfügbar.", "citation_index_unavailable");
    if (error instanceof Error && "code" in error && error.code === "source_grounding_failed") {
      if ("issue" in error && error.issue === "scope") return failure("validation", "Bitte höchstens 200 Seiten mit insgesamt 1 048 576 UTF-8-Bytes auslesbarem Text auswählen. Es wurde nichts gekürzt.", "citation_check_scope");
      return failure("not_found", "Eine ausgewählte eigene PDF-Fassung ist nicht verfügbar oder nicht vollständig lesbar.", "citation_check_source_unavailable");
    }
    return failure("unavailable", "Die Zitatprüfung konnte nicht vollständig abgeschlossen werden. Es wurde kein Teilergebnis freigegeben.", "citation_check_unavailable");
  } finally { activeChecks--; }
}
