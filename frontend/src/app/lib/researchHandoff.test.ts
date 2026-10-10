import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchHandoffPublicSource } from "@mike/contracts";
import type { PublicDecisionDetail } from "./knowledgeApi";
import { safeCourtOSResearchNext } from "./authRedirects";
import {
    acknowledgeResearchHandoff, canonicalResearchHandoffState, capturePendingResearchHandoff,
    clearPendingResearchHandoff, clearResearchHandoffLocation, clearResearchHandoffReference,
    createResearchHandoff, emptyResearchHandoffState, getPendingResearchHandoff,
    getResearchHandoff, getResearchHandoffMetadata, getResearchHandoffReference,
    parseResearchHandoffLocation, researchHandoffUrl, revalidateHandoffExcerpt,
    storeResearchHandoffReference, updateResearchHandoff,
} from "./researchHandoff";

const ID = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const SCOPE = "a".repeat(64);
const VERSION = "33333333-3333-4333-8333-333333333333";
const decision = { decision_id: "bge_BGE_137_I_195", court: "bge", canton: "CH", docket_number: "BGE137I195", decision_date: "2011-09-01", language: "de", title: "Testquelle", source_url: "https://example.org/decision", pdf_url: null, content_hash: "a".repeat(64), scraped_at: null, snippet: "Ein öffentlicher Auszug." };
const meta = () => ({ id: ID, revision: 1, expires_at: new Date(Date.now() + 60_000).toISOString(), direction: "to_browser" as const, acknowledged_revision: 0 });
const reference = (host: "word" | "browser" = "word") => ({ id: ID, revision: 1, expires_at: new Date(Date.now() + 60_000).toISOString(), host });
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/research"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("bounded research handoff projection", () => {
    it("retains research context but strips incidental raw bodies, HTML and sender verification flags", () => {
        const state = emptyResearchHandoffState();
        state.public.query = "rechtliches Gehör";
        state.public.result = { results: [decision], query_mode: "opencaselaw_ai", database_generation: null };
        const input = { ...state, body: "MUST NOT TRANSFER", public: { ...state.public, source: { decision: { ...decision, passage: { text: "WHOLE TEXT" }, verified: true }, start: 0, history: [], excerpt: null } }, private: { ...state.private, result: { results: [], documents: [{ document_id: DOC, version_id: VERSION, index_status: "ready", indexed_pages: 1, total_pages: 1, reason: "internal", indexed_at: "internal" }], notices: [] } } };
        const output = canonicalResearchHandoffState(input);
        expect(output.public.query).toBe(state.public.query);
        expect(output.public.result?.results).toEqual([decision]);
        expect(JSON.stringify(output)).not.toMatch(/MUST NOT TRANSFER|WHOLE TEXT|verified|indexed_at|internal/);
    });

    it("rejects excessive UTF8 bytes before any request", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const state = emptyResearchHandoffState();
        state.private.result = { results: Array.from({ length: 12 }, () => ({ document_id: DOC, version_id: VERSION, version_number: 1, filename: "quelle.pdf", page: 1, quote: "漢".repeat(3000), score: 0 })), documents: [], notices: [] };
        await expect(createResearchHandoff(state)).rejects.toMatchObject({ code: "invalid" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["javascript:alert(1)", "https://name:password@example.org", "file:///tmp/private"])("rejects unsafe source URL %s", (source_url) => {
        const state = emptyResearchHandoffState(); state.public.result = { results: [{ ...decision, source_url }], query_mode: "opencaselaw_ai", database_generation: null };
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
});

describe("account checked endpoint contract", () => {
    it("uses exact same-origin routes, conditional revision and explicit acknowledgement", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply(meta()))
            .mockResolvedValueOnce(reply({ ...meta(), state: emptyResearchHandoffState() }))
            .mockResolvedValueOnce(reply(meta()))
            .mockResolvedValueOnce(reply({ ...meta(), revision: 2, direction: "to_word" }))
            .mockResolvedValueOnce(reply({ ...meta(), revision: 2, direction: "to_word", acknowledged_revision: 2 }));
        const state = emptyResearchHandoffState();
        await createResearchHandoff(state); await getResearchHandoff(ID); await getResearchHandoffMetadata(ID);
        await updateResearchHandoff(ID, 1, state, "to_word"); await acknowledgeResearchHandoff(ID, 2);
        expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/knowledge/handoffs", `/api/knowledge/handoffs/${ID}`, `/api/knowledge/handoffs/${ID}?metadata=true`, `/api/knowledge/handoffs/${ID}`, `/api/knowledge/handoffs/${ID}/ack`]);
        for (const [, options] of fetch.mock.calls) expect(options).toMatchObject({ credentials: "include", mode: "cors", redirect: "error", cache: "no-store" });
        expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toEqual({ expected_revision: 1, state, direction: "to_word" });
        expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ expected_revision: 2 });
    });

    it("does not accept a different record identity from the server response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ ...meta(), id: DOC, state: emptyResearchHandoffState() }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });

    it("keeps missing, expired and other-account records indistinguishable and redacts raw errors", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ detail: "private diagnostic and another account name" }, 404));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "account" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("surfaces stale revision as conflict without automatic resend", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ code: "handoff_conflict" }, 409));
        await expect(updateResearchHandoff(ID, 1, emptyResearchHandoffState(), "to_word")).rejects.toMatchObject({ code: "conflict" });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("cancels an oversized streamed response instead of buffering it fully", async () => {
        const cancel = vi.fn(); let pulls = 0;
        const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(40_000)); }, cancel });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
        expect(cancel).toHaveBeenCalledTimes(1); expect(pulls).toBeLessThanOrEqual(3);
    });
});

describe("opaque login return and owner-bound local reference", () => {
    it("puts only the opaque ID into a fixed HTTPS research URL and preserves that exact login return", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const url = researchHandoffUrl("https://sandbox.swisslaw.io", ID);
        expect(url).toBe(`https://sandbox.swisslaw.io/research?handoff=${ID}`);
        expect(safeCourtOSResearchNext(`/research?handoff=${ID}`, "/research")).toBe(`/research?handoff=${ID}`);
        expect(researchHandoffUrl("https://sandbox.swisslaw.io/other", ID)).toBeNull();
        expect(researchHandoffUrl("http://sandbox.swisslaw.io", ID)).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([`?handoff=${ID}&query=private`, `?handoff=${ID}&handoff=${DOC}`, `?handoff=${ID}#anything`, "?handoff=https://elsewhere.example", "?handoff=secret words"])("rejects unallowlisted return state %s", search => {
        expect(parseResearchHandoffLocation(search)).toBeNull();
        expect(safeCourtOSResearchNext(`/research${search}`, "/research")).toBe("/research");
    });

    it("captures only a pending handle before login and removes URL only on explicit success cleanup", () => {
        window.history.replaceState(null, "", `/research?handoff=${ID}`);
        expect(capturePendingResearchHandoff()).toBe(ID);
        expect(getPendingResearchHandoff()).toBe(ID);
        expect(window.location.search).toBe(`?handoff=${ID}`);
        expect(sessionStorage.getItem(sessionStorage.key(0)!)).not.toMatch(/query|quote|password|token/);
        clearResearchHandoffLocation(); clearPendingResearchHandoff();
        expect(window.location.pathname).toBe("/research"); expect(window.location.search).toBe(""); expect(getPendingResearchHandoff()).toBeNull();
    });

    it("retains the exact safe login next when session storage is disabled", () => {
        window.history.replaceState(null, "", `/research?handoff=${ID}`);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(capturePendingResearchHandoff()).toBe(ID);
        expect(safeCourtOSResearchNext(window.location.pathname + window.location.search, "/research")).toBe(`/research?handoff=${ID}`);
    });

    it("isolates accounts and Word/browser references and expires stale pointers", () => {
        expect(storeResearchHandoffReference("alice", reference(), SCOPE)).toBe(true);
        expect(getResearchHandoffReference("alice", "word", SCOPE)?.id).toBe(ID);
        expect(getResearchHandoffReference("bob", "word", SCOPE)).toBeNull();
        expect(getResearchHandoffReference("alice", "browser")).toBeNull();
        const key = sessionStorage.key(0)!; const value = JSON.parse(sessionStorage.getItem(key)!);
        sessionStorage.setItem(key, JSON.stringify({ ...value, ownerId: "bob" }));
        expect(getResearchHandoffReference("alice", "word", SCOPE)).toBeNull();
        storeResearchHandoffReference("expiry", reference(), SCOPE);
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
        expect(getResearchHandoffReference("expiry", "word", SCOPE)).toBeNull();
    });

    it("does not resurrect an old pointer when both writing and removal fail", () => {
        storeResearchHandoffReference("blocked", reference(), SCOPE);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(storeResearchHandoffReference("blocked", { ...reference(), id: DOC }, SCOPE)).toBe(false);
        expect(getResearchHandoffReference("blocked", "word", SCOPE)).toBeNull();
        clearResearchHandoffReference("blocked", "word", SCOPE);
        expect(getResearchHandoffReference("blocked", "word", SCOPE)).toBeNull();
    });
    it("never restores a different or unsaved Word document's previous handle", () => {
        expect(storeResearchHandoffReference("document-owner", reference())).toBe(false);
        expect(getResearchHandoffReference("document-owner", "word")).toBeNull();
        expect(storeResearchHandoffReference("document-owner", reference(), SCOPE)).toBe(true);
        expect(getResearchHandoffReference("document-owner", "word", "b".repeat(64))).toBeNull();
        expect(getResearchHandoffReference("document-owner", "word", SCOPE)?.id).toBe(ID);
        expect(JSON.stringify([...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i)!)))).not.toContain(".docx");
    });
});

describe("restored pinpoint validation against refetched original", () => {
    const quote = "Hier steht ein genauer öffentlicher Quellenauszug.";
    const full = "🙂 " + quote + " Ende.";
    const source: ResearchHandoffPublicSource = { decision, start: 100, history: [0], excerpt: { text: quote, start: 102, end: 102 + Array.from(quote).length, total_chars: 500 } };
    const detail: PublicDecisionDetail = { ...decision, passage: { start: 100, end: 100 + Array.from(full).length, total_chars: 500, text: full, has_more: true } };
    it("restores the exact Unicode character range only after a matching original fetch", () => {
        expect(revalidateHandoffExcerpt(source, detail)).toEqual(source.excerpt);
    });
    it.each([
        { ...detail, content_hash: "different" }, { ...detail, content_hash: null },
        { ...detail, decision_id: "different" }, { ...detail, passage: { ...detail.passage, start: 99 } },
        { ...detail, passage: { ...detail.passage, text: full.replace("genauer", "anderer") } },
        { ...detail, passage: { ...detail.passage, total_chars: 501 } },
    ])("refuses changed identity, hash, passage or offsets", changed => {
        expect(revalidateHandoffExcerpt(source, changed)).toBeNull();
    });
});
