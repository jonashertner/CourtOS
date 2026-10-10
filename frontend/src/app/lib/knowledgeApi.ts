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
    date_is_estimated?: boolean | null;
    source_note?: string | null;
    snippet: string;
}
export interface PublicSearch {
    results: PublicDecision[];
    query_mode: "literal_terms" | "opencaselaw_ai";
    ai_assisted?: boolean;
    degraded?: boolean;
    database_generation: string | number | null;
    ranking?: string;
    candidate_limit?: number;
    candidates_examined?: number;
}
export interface PublicDecisionDetail extends PublicDecision {
    passage: { start: number; end: number; text: string; total_chars: number; has_more: boolean };
}

export type KnowledgeApiErrorCode = "timeout" | "busy" | "query" | "session" | "changed" | "source" | "capacity" | "input" | "unavailable";
export class KnowledgeApiError extends Error {
    constructor(readonly code: KnowledgeApiErrorCode, message: string) { super(message); this.name = "KnowledgeApiError"; }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await authenticatedFetch(`/api/knowledge${path}`, {
        cache: "no-store", ...init,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    if (!response.ok) {
        // Do not expose raw infrastructure responses or send search terms to telemetry.
        let code: unknown;
        try { code = ((await response.json()) as { code?: unknown })?.code; } catch { /* use the status-only fallback */ }
        const publicMessage = path.startsWith("/public/") && response.status === 503
            ? code === "public_research_timeout" ? "Die Suche hat zu lange gedauert. Bitte präzisere Begriffe verwenden oder die Sprache eingrenzen."
                : code === "public_research_busy" ? "Die öffentliche Suche ist gerade ausgelastet. Bitte kurz warten und erneut suchen." : null
            : path.startsWith("/public/") && response.status === 400 && code === "public_research_invalid_query"
                ? "Bitte ein bis acht kurze Suchbegriffe verwenden." : null;
        const message = response.status === 401 ? "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an."
            : response.status === 409 ? "Die ausgewählten Quellen wurden geändert oder werden gerade erfasst. Bitte den Bestand aktualisieren und erneut suchen."
            : response.status === 403 || response.status === 404 ? "Diese Quelle ist für Ihr Konto nicht verfügbar. Aktualisieren Sie die Auswahl."
            : response.status === 429 ? "Die Suche ist gerade ausgelastet. Bitte versuchen Sie es später erneut."
            : response.status === 400 || response.status === 422 ? "Bitte prüfen Sie Suchtext und Dokumentauswahl."
            : "Die Suche ist vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.";
        const safeCode: KnowledgeApiErrorCode = publicMessage
            ? code === "public_research_timeout" ? "timeout" : code === "public_research_busy" ? "busy" : "query"
            : response.status === 401 ? "session" : response.status === 409 ? "changed"
            : response.status === 403 || response.status === 404 ? "source" : response.status === 429 ? "capacity"
            : response.status === 400 || response.status === 422 ? "input" : "unavailable";
        throw new KnowledgeApiError(safeCode, publicMessage || message);
    }
    return response.json() as Promise<T>;
}

export function searchKnowledge(query: string, document_ids: string[], signal?: AbortSignal) {
    return request<KnowledgeSearch>("/search", { method: "POST", body: JSON.stringify({ query, document_ids, limit: 12 }), signal });
}
export async function searchPublicKnowledge(query: string, language: string, signal?: AbortSignal) {
    // One bounded request:45s public adapter,47s backend,50s browser fallback.
    // A local abort stops waiting; it cannot promise that upstream AI stopped.
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 50_000);
    try {
        return await request<PublicSearch>("/public/search", { method: "POST", body: JSON.stringify({ query, limit: 5, ...(language ? { language } : {}) }), signal: controller.signal });
    } catch (error) {
        if (timedOut) throw new KnowledgeApiError("timeout", "Die Suche hat zu lange gedauert. Bitte präzisere Begriffe verwenden oder die Sprache eingrenzen.");
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
    }
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
