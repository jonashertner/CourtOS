/** Formal citation checking only; never a finding of legal support or truth. */
export type CitationCheckInput = { sources: Array<{ document_id: string; version_id: string }> };
export type FormalCitationStatus = "found" | "differs" | "missing" | "unchecked";
export type CitationIndexDecision = { decision_id: string; label: string; court: string; canton: string; date: string | null; numbered_sections: string[] };
export type CitationCheckFinding = {
  id: string;
  source: { document_id: string; version_id: string; version_number: number | null; filename: string; pdf_sha256: string; page_sha256: string; page: number; start: number; end: number; quote: string };
  status: FormalCitationStatus;
  pinpoint: "not_requested" | "not_checked" | "exists" | "absent" | "parent_only" | "no_structure";
  decisions: CitationIndexDecision[];
  decisions_omitted: number;
  issues: Array<{ kind: "court" | "date" | "date_invalid" | "pinpoint" | "page"; written: string | string[] | number[] | null; listed: string[]; nearby: string[] }>;
  notes: Array<{ kind: string; written: string | number[] | null; parent: string | null }>;
  suggestions: Array<{ reason: string; decision: CitationIndexDecision }>;
  semantic_support: "not_assessed";
  quoted_decision_wording: "not_checked";
};
export type CitationCheckReport = {
  version: 1;
  checked_at: string;
  engine: { name: "citecheck"; commit: string };
  index: { generated: string; sha256: string; decisions: number; labels: number; with_numbering: number };
  coverage: { documents: number; pages: number; extracted_text_bytes: number; complete_selected_extracted_text: true; all_citation_forms_recognised: false; images_checked: false; multiple_pinpoints: "first_only" };
  counts: Record<FormalCitationStatus, number>;
  findings: CitationCheckFinding[];
  semantic_support: "not_assessed";
};
