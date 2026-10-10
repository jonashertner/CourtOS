/** Account-owned, temporary research draft. Never an access grant or source verification. */
export interface ResearchHandoffPublicDecision {
    decision_id: string;
    court: string | null;
    canton: string | null;
    docket_number: string | null;
    decision_date: string | null;
    language: string | null;
    title: string | null;
    source_url: string | null;
    pdf_url: string | null;
    content_hash: string | null;
    scraped_at: string | null;
    date_is_estimated?: boolean | null;
    source_note?: string | null;
    snippet: string;
}
export interface ResearchHandoffPublicResults {
    results: ResearchHandoffPublicDecision[];
    query_mode: "literal_terms" | "opencaselaw_ai";
    ai_assisted?: boolean;
    degraded?: boolean;
    database_generation: string | number | null;
    ranking?: string;
    candidate_limit?: number;
    candidates_examined?: number;
}
export interface ResearchHandoffPassage {
    text: string;
    start: number;
    end: number;
    total_chars: number;
}
export interface ResearchHandoffPublicSource {
    /** Use the last fetched detail's metadata where available. */
    decision: ResearchHandoffPublicDecision;
    start: number;
    history: number[];
    /** Must be rechecked against the original's current exact-ID response. */
    excerpt: ResearchHandoffPassage | null;
}
export interface ResearchHandoffLibraryDocument {
    id: string;
    filename: string;
    file_type: string | null;
    active_version_id: string | null;
    active_version_number: number | null;
    size_bytes: number | null;
}
export interface ResearchHandoffPrivateResult {
    document_id: string;
    version_id: string;
    version_number: number | null;
    filename: string;
    page: number;
    quote: string;
    score: number;
}
export interface ResearchHandoffPrivateResults {
    results: ResearchHandoffPrivateResult[];
    documents: {
        document_id: string;
        version_id: string;
        index_status: "ready" | "partial" | "unreadable";
        indexed_pages: number;
        total_pages: number;
    }[];
    notices: string[];
}
export interface ResearchHandoffState {
    version: 1;
    /** Only a reference to an owned personal chat, never its transcript. */
    conversation?: { chat_id: string | null; draft: string };
    mode: "public" | "private";
    public: {
        query: string;
        submitted: string;
        language: "" | "de" | "fr" | "it";
        result: ResearchHandoffPublicResults | null;
        source: ResearchHandoffPublicSource | null;
    };
    private: {
        query: string;
        submitted: string;
        selected: ResearchHandoffLibraryDocument[];
        result: ResearchHandoffPrivateResults | null;
        source: ResearchHandoffPrivateResult | null;
    };
}
export type ResearchHandoffDirection = "to_browser" | "to_word";
export interface ResearchHandoffMetadata {
    id: string;
    revision: number;
    expires_at: string;
    direction: ResearchHandoffDirection;
    acknowledged_revision: number;
}
export interface ResearchHandoffRecord extends ResearchHandoffMetadata {
    state: ResearchHandoffState;
}
