import { authenticatedFetch } from "./authEvents";

export interface KnowledgeResult {
    document_id: string;
    version_id: string;
    version_number: number | null;
    filename: string;
    page: number;
    quote: string;
    score: number;
}
export interface KnowledgeSearch {
    results: KnowledgeResult[];
    documents: {
        document_id: string;
        version_id: string;
        index_status: "ready" | "partial" | "unreadable";
        indexed_pages: number;
        total_pages: number;
    }[];
    notices: string[];
}
export interface PublicDecision {
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
    snippet: string;
}
export interface PublicSearch {
    results: PublicDecision[];
    query_mode: "literal_terms";
    database_generation: string;
}
export interface PublicDecisionDetail extends PublicDecision {
    passage: { start: number; end: number; text: string; total_chars: number; has_more: boolean };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await authenticatedFetch(`/api/knowledge${path}`, {
        cache: "no-store", ...init,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    if (!response.ok) {
        // Do not expose raw infrastructure responses or send search terms to telemetry.
        const message = response.status === 401 ? "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an."
            : response.status === 403 || response.status === 404 ? "Diese Quelle ist für Ihr Konto nicht verfügbar. Aktualisieren Sie die Auswahl."
            : response.status === 429 ? "Die Suche ist gerade ausgelastet. Bitte versuchen Sie es später erneut."
            : response.status === 400 || response.status === 422 ? "Bitte prüfen Sie Suchtext und Dokumentauswahl."
            : "Die Suche ist vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.";
        throw new Error(message);
    }
    return response.json() as Promise<T>;
}

export function searchKnowledge(query: string, document_ids: string[], signal?: AbortSignal) {
    return request<KnowledgeSearch>("/search", { method: "POST", body: JSON.stringify({ query, document_ids, limit: 12 }), signal });
}
export function searchPublicKnowledge(query: string, language: string, signal?: AbortSignal) {
    return request<PublicSearch>("/public/search", { method: "POST", body: JSON.stringify({ query, limit: 5, ...(language ? { language } : {}) }), signal });
}
export function getPublicDecision(id: string, start = 0, signal?: AbortSignal) {
    return request<PublicDecisionDetail>(`/public/decisions/${encodeURIComponent(id)}?start=${start}&length=4000`, { method: "GET", signal });
}

/** Only ordinary original-source links may leave the application. */
export function publicSourceUrl(value: string | null): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
}
