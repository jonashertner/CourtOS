/** A bounded AI review draft. Literal source matching is not semantic verification. */
export type CaseReviewKind = "facts" | "legal" | "chronology";
export type CaseReviewRole = "claim" | "response" | "exhibit" | "authority" | "other";
export type CaseReviewAssessment = "supports" | "contradicts" | "inconclusive" | "not_found";
export type CaseReviewInput = {
  request_id: string;
  kind: CaseReviewKind;
  language: "de" | "fr" | "it" | "en";
  sources: Array<{ document_id: string; version_id: string; role: CaseReviewRole; party_label: string | null }>;
};
export type CaseReviewSource = {
  passage_id: string;
  document_id: string;
  version_id: string;
  version_number: number | null;
  filename: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  pdf_sha256: string;
  page_sha256: string;
  source_match: "exact";
};
export type CaseReviewRow = {
  id: string;
  category: "fact" | "legal";
  /** Exact words from the pleading, not an AI paraphrase. */
  proposition: CaseReviewSource;
  party_label: string | null;
  source_role: CaseReviewRole;
  /** Proposed classification; the source words remain visible beside it. */
  posture: "allegation" | "denial" | "document_statement" | "legal_argument" | "unresolved";
  date: CaseReviewSource | null;
  /** Deterministically parsed explicit day; never an inferred event date. */
  date_sort: string | null;
  date_status: "exact_day" | "ambiguous" | "undated";
  amounts: CaseReviewSource[];
  assessment: CaseReviewAssessment;
  reasoning: string;
  evidence: CaseReviewSource[];
  opposing_position: CaseReviewSource[];
  cited_references: CaseReviewSource[];
  assessment_basis: "selected_sources_only";
  semantic_status: "ai_draft_requires_review";
};
export type CaseReviewReport = {
  version: 1;
  kind: CaseReviewKind;
  language: "de" | "fr" | "it" | "en";
  processing: "courtos_server_germany";
  model: string;
  rows: CaseReviewRow[];
  coverage: {
    selection: Array<{ document_id: string; version_id: string; version_number: number | null; filename: string; pages: number[]; role: CaseReviewRole; party_label: string | null }>;
    extracted_text_bytes: number;
    complete_selected_text: true;
    /** Model extraction can omit claims even when every page was supplied. */
    all_claims_extracted: false;
    more_claims_reported: boolean;
    external_legal_research_performed: false;
  };
  notices: string[];
};
export type CaseReviewStatus = "queued" | "reading" | "analysing" | "checking" | "completed" | "failed" | "cancelled" | "interrupted";
export type CaseReviewRecord = {
  id: string;
  status: CaseReviewStatus;
  created_at: string;
  input: CaseReviewInput;
  report: CaseReviewReport | null;
  error: { code: string; detail: string } | null;
};
