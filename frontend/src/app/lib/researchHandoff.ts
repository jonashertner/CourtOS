import type {
    ResearchHandoffDirection, ResearchHandoffMetadata, ResearchHandoffRecord,
    ResearchHandoffState, ResearchHandoffPublicDecision, ResearchHandoffPublicSource,
    ResearchHandoffPrivateResult, ResearchHandoffPassage,
} from "@mike/contracts";
import { authenticatedFetch } from "./authEvents";
import type { PublicDecisionDetail } from "./knowledgeApi";

export type { ResearchHandoffState, ResearchHandoffMetadata, ResearchHandoffRecord } from "@mike/contracts";
export const RESEARCH_HANDOFF_MAX_BYTES = 65_536;
const RESPONSE_MAX_BYTES = RESEARCH_HANDOFF_MAX_BYTES + 4096;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DECISION = /^[a-zA-Z0-9][a-zA-Z0-9_.:# -]{0,239}$/;
const LIFETIME = 2 * 60 * 60 * 1000;
const PENDING_KEY = "courtos:research-handoff:pending";
type Json = Record<string, unknown>;
type HandoffCode = "invalid" | "unavailable" | "account" | "conflict" | "limit" | "expired";
const messages: Record<HandoffCode, string> = {
    invalid: "Dieser Recherchestand kann nicht übertragen werden. Bitte die Auswahl verkleinern.",
    unavailable: "Der Recherchestand konnte nicht übertragen werden. Bitte erneut versuchen.",
    account: "Dieser Recherchestand ist abgelaufen oder für dieses Konto nicht verfügbar. Verwenden Sie in Word und im Browser dasselbe Konto.",
    conflict: "Der Recherchestand wurde inzwischen geändert. Bitte den neueren Stand prüfen, bevor Sie ihn ersetzen.",
    limit: "Zu viele Recherchestände sind noch offen. Bitte später erneut versuchen.",
    expired: "Dieser Recherchestand ist abgelaufen. Bitte erneut aus Word öffnen.",
};
export class ResearchHandoffError extends Error {
    constructor(readonly code: HandoffCode) { super(messages[code]); this.name = "ResearchHandoffError"; }
}
const invalid = (): never => { throw new ResearchHandoffError("invalid"); };
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : invalid(); }
function text(value: unknown, max: number): string { return typeof value === "string" && value.length <= max && !value.includes("\0") && !/[\uD800-\uDFFF]/u.test(value) ? value : invalid(); }
function integer(value: unknown, max = 20_000_000, min = 0): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid(); }
function nullable<T>(value: unknown, read: (v: unknown) => T): T | null { return value === null ? null : read(value); }
function array<T>(value: unknown, max: number, read: (v: unknown) => T): T[] { return Array.isArray(value) && value.length <= max ? value.map(read) : invalid(); }
function uuid(value: unknown): string { return typeof value === "string" && UUID.test(value) ? value : invalid(); }
function choice<T extends string>(value: unknown, options: readonly T[]): T { return typeof value === "string" && options.includes(value as T) ? value as T : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function url(value: unknown): string {
    const raw = text(value, 2048);
    try { const parsed = new URL(raw); if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) return raw; } catch { /* fixed validation error */ }
    return invalid();
}
function decision(value: unknown): ResearchHandoffPublicDecision {
    const v = object(value); const id = text(v.decision_id, 240); if (!DECISION.test(id)) return invalid();
    return {
        decision_id: id, court: nullable(v.court, x => text(x, 200)), canton: nullable(v.canton, x => text(x, 20)),
        docket_number: nullable(v.docket_number, x => text(x, 300)), decision_date: nullable(v.decision_date, x => text(x, 40)),
        language: nullable(v.language, x => text(x, 20)), title: nullable(v.title, x => text(x, 1000)),
        source_url: nullable(v.source_url, url), pdf_url: nullable(v.pdf_url, url),
        content_hash: nullable(v.content_hash, x => text(x, 200)), scraped_at: nullable(v.scraped_at, x => text(x, 100)),
        snippet: text(v.snippet, 2000),
        ...(v.date_is_estimated !== undefined ? { date_is_estimated: nullable(v.date_is_estimated, bool) } : {}),
        ...(v.source_note !== undefined ? { source_note: nullable(v.source_note, x => text(x, 2000)) } : {}),
    };
}
function passage(value: unknown): ResearchHandoffPassage {
    const v = object(value); const p = { text: text(v.text, 1600), start: integer(v.start), end: integer(v.end), total_chars: integer(v.total_chars) };
    const length = Array.from(p.text).length;
    if (length < 20 || length > 800 || p.end - p.start !== length || p.end > p.total_chars) return invalid();
    return p;
}
function privateResult(value: unknown): ResearchHandoffPrivateResult {
    const v = object(value);
    if (typeof v.score !== "number" || !Number.isFinite(v.score)) return invalid();
    return { document_id: uuid(v.document_id), version_id: uuid(v.version_id), version_number: nullable(v.version_number, x => integer(x, 1_000_000, 1)), filename: text(v.filename, 300), page: integer(v.page, 99999, 1), quote: text(v.quote, 3000), score: v.score };
}

export function emptyResearchHandoffState(): ResearchHandoffState {
    return { version: 1, mode: "public", public: { query: "", submitted: "", language: "", result: null, source: null }, private: { query: "", submitted: "", selected: [], result: null, source: null } };
}

/** Project declared fields only: no body/HTML, incidental server metadata or sender verification flags. */
export function canonicalResearchHandoffState(value: unknown): ResearchHandoffState {
    const v = object(value); if (v.version !== 1) return invalid();
    const pub = object(v.public); const own = object(v.private);
    const state: ResearchHandoffState = {
        version: 1, mode: choice(v.mode, ["public", "private"]),
        public: {
            query: text(pub.query, 180), submitted: text(pub.submitted, 180), language: choice(pub.language, ["", "de", "fr", "it"]),
            result: nullable(pub.result, value => {
                const r = object(value);
                return { results: array(r.results, 5, decision), query_mode: choice(r.query_mode, ["literal_terms", "opencaselaw_ai"]),
                    database_generation: r.database_generation === null ? null : typeof r.database_generation === "number" ? integer(r.database_generation, Number.MAX_SAFE_INTEGER) : text(r.database_generation, 200),
                    ...(r.ai_assisted !== undefined ? { ai_assisted: bool(r.ai_assisted) } : {}), ...(r.degraded !== undefined ? { degraded: bool(r.degraded) } : {}),
                    ...(r.ranking !== undefined ? { ranking: text(r.ranking, 120) } : {}), ...(r.candidate_limit !== undefined ? { candidate_limit: integer(r.candidate_limit, 4096, 1) } : {}),
                    ...(r.candidates_examined !== undefined ? { candidates_examined: integer(r.candidates_examined, 4096) } : {}) };
            }),
            source: nullable(pub.source, value => {
                const s = object(value); const source = { decision: decision(s.decision), start: integer(s.start), history: array(s.history, 32, x => integer(x)), excerpt: nullable(s.excerpt, passage) };
                if (source.excerpt && (source.excerpt.start < source.start || source.excerpt.end > source.start + 4000)) return invalid();
                return source;
            }),
        },
        private: {
            query: text(own.query, 300), submitted: text(own.submitted, 300),
            selected: array(own.selected, 20, value => { const d = object(value); return { id: uuid(d.id), filename: text(d.filename, 300), file_type: nullable(d.file_type, x => text(x, 80)), active_version_id: nullable(d.active_version_id, uuid), active_version_number: nullable(d.active_version_number, x => integer(x, 1_000_000, 1)), size_bytes: nullable(d.size_bytes, x => integer(x, Number.MAX_SAFE_INTEGER)) }; }),
            result: nullable(own.result, value => {
                const r = object(value); return { results: array(r.results, 12, privateResult), documents: array(r.documents, 20, value => { const d = object(value); return { document_id: uuid(d.document_id), version_id: uuid(d.version_id), index_status: choice(d.index_status, ["ready", "partial", "unreadable"]), indexed_pages: integer(d.indexed_pages, 99999), total_pages: integer(d.total_pages, 99999) }; }), notices: array(r.notices, 20, x => text(x, 1000)) };
            }),
            source: nullable(own.source, privateResult),
        },
    };
    if (new Set(state.private.selected.map(document => document.id.toLowerCase())).size !== state.private.selected.length) return invalid();
    if (new TextEncoder().encode(JSON.stringify(state)).byteLength > RESEARCH_HANDOFF_MAX_BYTES) return invalid();
    return state;
}

function metadata(value: unknown): ResearchHandoffMetadata {
    const v = object(value); const revision = integer(v.revision, 32, 1); const expiry = text(v.expires_at, 100);
    if (!Number.isFinite(Date.parse(expiry))) return invalid();
    return { id: uuid(v.id), revision, expires_at: expiry, direction: choice(v.direction, ["to_browser", "to_word"]), acknowledged_revision: integer(v.acknowledged_revision, revision) };
}
async function boundedJson(response: Response): Promise<unknown> {
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > RESPONSE_MAX_BYTES)) { await response.body?.cancel(); throw new ResearchHandoffError("unavailable"); }
    if (!response.body) throw new ResearchHandoffError("unavailable");
    const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0; let content = "";
    try {
        while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > RESPONSE_MAX_BYTES) { await reader.cancel(); throw new ResearchHandoffError("unavailable"); }
            content += decoder.decode(chunk.value, { stream: true });
        }
        content += decoder.decode(); return JSON.parse(content);
    } finally { reader.releaseLock(); }
}
async function request(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
        const response = await authenticatedFetch(`/api/knowledge/handoffs${path}`, { method, mode: "cors", redirect: "error", cache: "no-store", signal, headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403 || response.status === 404) throw new ResearchHandoffError("account");
            if (response.status === 409) { const problem = object(await boundedJson(response)); throw new ResearchHandoffError(problem.code === "handoff_limit" || problem.code === "handoff_revision_limit" ? "limit" : "conflict"); }
            throw new ResearchHandoffError(response.status === 400 || response.status === 413 ? "invalid" : response.status === 429 ? "limit" : "unavailable");
        }
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw new ResearchHandoffError("unavailable");
        return await boundedJson(response);
    } catch (error) {
        if (error instanceof ResearchHandoffError) throw error;
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        throw new ResearchHandoffError("unavailable");
    }
}
const idPath = (id: string) => `/${uuid(id)}`;
export async function createResearchHandoff(state: ResearchHandoffState, signal?: AbortSignal): Promise<ResearchHandoffMetadata> { return metadata(await request("", "POST", { state: canonicalResearchHandoffState(state) }, signal)); }
export async function getResearchHandoff(id: string, signal?: AbortSignal): Promise<ResearchHandoffRecord> {
    const raw = object(await request(idPath(id), "GET", undefined, signal)); const meta = metadata(raw);
    if (meta.id !== id) throw new ResearchHandoffError("unavailable");
    return { ...meta, state: canonicalResearchHandoffState(raw.state) };
}
export async function getResearchHandoffMetadata(id: string, signal?: AbortSignal): Promise<ResearchHandoffMetadata> {
    const result = metadata(await request(`${idPath(id)}?metadata=true`, "GET", undefined, signal)); if (result.id !== id) throw new ResearchHandoffError("unavailable"); return result;
}
export async function updateResearchHandoff(id: string, expectedRevision: number, state: ResearchHandoffState, direction: ResearchHandoffDirection, signal?: AbortSignal): Promise<ResearchHandoffMetadata> {
    const result = metadata(await request(idPath(id), "PATCH", { expected_revision: integer(expectedRevision, 32, 1), state: canonicalResearchHandoffState(state), direction: choice(direction, ["to_word", "to_browser"]) }, signal));
    if (result.id !== id) throw new ResearchHandoffError("unavailable"); return result;
}
export async function acknowledgeResearchHandoff(id: string, expectedRevision: number, signal?: AbortSignal): Promise<ResearchHandoffMetadata> {
    const result = metadata(await request(`${idPath(id)}/ack`, "POST", { expected_revision: integer(expectedRevision, 32, 1) }, signal)); if (result.id !== id) throw new ResearchHandoffError("unavailable"); return result;
}

/** A random identifier is not an access credential. No source/query text enters this URL. */
export function researchHandoffUrl(origin: string, id: string): string | null {
    try { const base = new URL(origin); if (base.protocol !== "https:" || base.origin !== origin || base.username || base.password || !UUID.test(id)) return null; return `${origin}/research?handoff=${id}`; } catch { return null; }
}
export function parseResearchHandoffFragment(hash: string): string | null { const m = /^#handoff=([a-f0-9-]{36})$/i.exec(hash); return m && UUID.test(m[1]) ? m[1] : null; }
export function parseResearchHandoffLocation(search: string, hash = ""): string | null {
    const m = /^\?handoff=([a-f0-9-]{36})$/i.exec(search);
    if (search) return m && UUID.test(m[1]) && !hash ? m[1] : null;
    return parseResearchHandoffFragment(hash);
}
export function capturePendingResearchHandoff(): string | null {
    if (typeof window === "undefined" || window.location.pathname !== "/research") return null;
    const id = parseResearchHandoffLocation(window.location.search, window.location.hash); if (!id) return null;
    try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id, created_at: Date.now() })); } catch { /* The allowlisted login next retains the URL even without storage. */ }
    return id;
}
export function getPendingResearchHandoff(): string | null {
    if (typeof window === "undefined") return null;
    try { const raw = window.sessionStorage.getItem(PENDING_KEY); if (!raw) return null; const v = object(JSON.parse(raw)); const age = Date.now() - integer(v.created_at, Number.MAX_SAFE_INTEGER); if (age < 0 || age >= LIFETIME) throw new Error(); return uuid(v.id); } catch { clearPendingResearchHandoff(); return null; }
}
export function clearPendingResearchHandoff(): void { try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* unavailable storage */ } }
/** Invoke only after owner-checked resolution, never before sign-in. */
export function clearResearchHandoffLocation(): void {
    if (typeof window !== "undefined" && window.location.pathname === "/research" && parseResearchHandoffLocation(window.location.search, window.location.hash)) window.history.replaceState(window.history.state, "", "/research");
}

export interface ResearchHandoffReference { id: string; revision: number; expires_at: string; host: "word" | "browser" }
const invalidReferences = new Set<string>();
const DOCUMENT_SCOPE = /^[a-f0-9]{64}$/;
function referenceKey(ownerId: string, host: "word" | "browser", scope?: string) { return `courtos:research-handoff:${host}:${ownerId}${host === "word" ? `:${scope ?? "unsaved"}` : ""}`; }
function ownerValid(ownerId: string): boolean { return !!ownerId && ownerId.length <= 128 && !/[\u0000-\u001f]/.test(ownerId); }
/** Word's document scope is a locally computed hash, never a path or server field.
 * Without a reliable saved-document scope, keep the current roundtrip in memory only. */
export function storeResearchHandoffReference(ownerId: string, reference: ResearchHandoffReference, documentScope?: string): boolean {
    const key = referenceKey(ownerId, reference.host, documentScope);
    try {
        if (!ownerValid(ownerId) || !UUID.test(reference.id) || !Number.isInteger(reference.revision) || reference.revision < 1 || reference.revision > 32 || !["word", "browser"].includes(reference.host) || !Number.isFinite(Date.parse(reference.expires_at)) || Date.parse(reference.expires_at) <= Date.now() || (reference.host === "word" && (!documentScope || !DOCUMENT_SCOPE.test(documentScope)))) throw new Error();
        window.sessionStorage.setItem(key, JSON.stringify({ ownerId, ...reference, ...(reference.host === "word" ? { documentScope } : {}) })); invalidReferences.delete(key); return true;
    } catch { invalidReferences.add(key); try { window.sessionStorage.removeItem(key); } catch { /* stale storage must not be trusted */ } return false; }
}
export function getResearchHandoffReference(ownerId: string, host: "word" | "browser", documentScope?: string): ResearchHandoffReference | null {
    const key = referenceKey(ownerId, host, documentScope); if (!ownerValid(ownerId) || invalidReferences.has(key) || (host === "word" && (!documentScope || !DOCUMENT_SCOPE.test(documentScope)))) return null;
    try {
        const raw = window.sessionStorage.getItem(key); if (!raw) return null; const v = object(JSON.parse(raw));
        if (v.ownerId !== ownerId || v.host !== host || (host === "word" && v.documentScope !== documentScope) || !Number.isFinite(Date.parse(String(v.expires_at))) || Date.parse(String(v.expires_at)) <= Date.now()) throw new Error();
        return { id: uuid(v.id), revision: integer(v.revision, 32, 1), expires_at: text(v.expires_at, 100), host };
    } catch { clearResearchHandoffReference(ownerId, host, documentScope); return null; }
}
export function clearResearchHandoffReference(ownerId: string, host: "word" | "browser", documentScope?: string): void {
    const key = referenceKey(ownerId, host, documentScope); invalidReferences.add(key); try { window.sessionStorage.removeItem(key); } catch { /* no content stored */ }
}

/** Restored client text is only a request to locate a passage, never proof of its content. */
export function revalidateHandoffExcerpt(source: ResearchHandoffPublicSource, detail: PublicDecisionDetail): ResearchHandoffPassage | null {
    try {
        if (source.decision.decision_id !== detail.decision_id || source.start !== detail.passage.start || (source.decision.content_hash && source.decision.content_hash !== detail.content_hash)) return null;
        const saved = passage(source.excerpt); const fresh = detail.passage; const points = Array.from(fresh.text);
        if (fresh.end - fresh.start !== points.length || fresh.end > fresh.total_chars || saved.total_chars !== fresh.total_chars || saved.start < fresh.start || saved.end > fresh.end) return null;
        return points.slice(saved.start - fresh.start, saved.end - fresh.start).join("") === saved.text ? saved : null;
    } catch { return null; }
}
