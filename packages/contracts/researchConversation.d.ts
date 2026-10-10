/** Explicit public-source selection. Offsets count Unicode codepoints, not PDF pages. */
export interface PublicSourceSelection {
    decision_id: string;
    start: number;
    end: number;
    content_hash: string | null;
}
/** Exact words located by the server; verified never asserts semantic entailment. */
export interface PublicDecisionCitation {
    type: "citation_data";
    kind: "public_decision";
    ref: number;
    decision_id: string;
    title: string;
    source_url: string | null;
    pdf_url: string | null;
    content_hash: string | null;
    start: number;
    end: number;
    quote: string;
    verified: boolean;
}
