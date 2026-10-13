import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchHandoffPublicSource } from "@mike/contracts";
import type { PublicDecisionDetail } from "./knowledgeApi";
import { safeCourtOSResearchNext } from "./authRedirects";
import {
    acknowledgeResearchHandoff, canonicalResearchHandoffState, capturePendingResearchHandoff,
    clearPendingResearchHandoff, clearResearchHandoffLocation, clearResearchHandoffReference,
    createResearchHandoff, emptyResearchHandoffState, getPendingResearchHandoff,
    getResearchHandoff, getResearchHandoffMetadata, getResearchHandoffReference,
    parseResearchHandoffFragment, parseResearchHandoffLocation, researchHandoffUrl, revalidateHandoffExcerpt,
    RESEARCH_HANDOFF_MAX_BYTES, storeResearchHandoffReference, updateResearchHandoff,
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
    it("preserves only the optional chat reference and bounded draft, never a transcript", () => {
        const legacy = canonicalResearchHandoffState(emptyResearchHandoffState());
        expect(legacy).not.toHaveProperty("conversation");
        const state = canonicalResearchHandoffState({ ...legacy, conversation: { chat_id: ID, draft: "Follow-up", messages: [{ content: "DO NOT COPY" }] } });
        expect(state.conversation).toEqual({ chat_id: ID, draft: "Follow-up" });
        expect(JSON.stringify(state)).not.toContain("DO NOT COPY");
        expect(() => canonicalResearchHandoffState({ ...legacy, conversation: { chat_id: ID, draft: "x".repeat(12001) } })).toThrow();
    });
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

    it.each(["a\0b", "a\uD800b"])("rejects a null byte or lone surrogate in free text %#", bad => {
        const state = emptyResearchHandoffState(); state.public.query = bad;
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
    it("rejects a state carrying any version other than the current one", () => {
        expect(() => canonicalResearchHandoffState({ ...emptyResearchHandoffState(), version: 2 })).toThrow();
    });
    it("rejects an unknown public language choice", () => {
        const state = emptyResearchHandoffState(); (state.public as { language: string }).language = "xx";
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
    it("rejects a public results list beyond the maximum candidate count", () => {
        const state = emptyResearchHandoffState();
        state.public.result = { results: Array.from({ length: 6 }, () => decision), query_mode: "opencaselaw_ai", database_generation: null };
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
    it("carries a textual database generation marker through unchanged", () => {
        const state = emptyResearchHandoffState();
        state.public.result = { results: [decision], query_mode: "opencaselaw_ai", database_generation: "gen-2024-09" };
        expect(canonicalResearchHandoffState(state).public.result?.database_generation).toBe("gen-2024-09");
    });
    it("rejects a decision_id that fails the citation-identifier format", () => {
        const state = emptyResearchHandoffState();
        state.public.result = { results: [{ ...decision, decision_id: "!not-allowed" }], query_mode: "opencaselaw_ai", database_generation: null };
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
    it("carries optional decision provenance fields (pdf URL, scrape time, estimated-date flag, source note) through unchanged", () => {
        const full = { ...decision, pdf_url: "https://example.org/decision.pdf", scraped_at: "2020-01-01T00:00:00Z", date_is_estimated: true, source_note: "Datum geschätzt." };
        const state = emptyResearchHandoffState(); state.public.result = { results: [full], query_mode: "opencaselaw_ai", database_generation: null };
        expect(canonicalResearchHandoffState(state).public.result?.results[0]).toEqual(full);
    });
    it("rejects a non-boolean estimated-date flag", () => {
        const state = emptyResearchHandoffState();
        state.public.result = { results: [{ ...decision, date_is_estimated: "yes" as unknown as boolean }], query_mode: "opencaselaw_ai", database_generation: null };
        expect(() => canonicalResearchHandoffState(state)).toThrow();
    });
    it("carries optional result-quality metadata and a numeric database generation through unchanged", () => {
        const state = emptyResearchHandoffState();
        state.public.result = { results: [decision], query_mode: "literal_terms", database_generation: 42, ai_assisted: true, degraded: false, ranking: "bm25", candidate_limit: 500, candidates_examined: 120 };
        expect(canonicalResearchHandoffState(state).public.result).toEqual(state.public.result);
    });

    describe("located-passage excerpt bounds", () => {
        it.each([
            { text: "short", start: 100, end: 105, total_chars: 1000 },
            { text: "x".repeat(801), start: 100, end: 901, total_chars: 1000 },
            { text: "x".repeat(40), start: 100, end: 141, total_chars: 1000 },
            { text: "x".repeat(40), start: 970, end: 1010, total_chars: 1000 },
        ])("rejects a malformed located passage %#", excerpt => {
            const state = emptyResearchHandoffState(); state.public.source = { decision, start: 100, history: [], excerpt };
            expect(() => canonicalResearchHandoffState(state)).toThrow();
        });
        it("accepts a pinpoint excerpt within the located passage's offset window", () => {
            const state = emptyResearchHandoffState();
            state.public.source = { decision, start: 100, history: [1, 2], excerpt: { text: "x".repeat(40), start: 110, end: 150, total_chars: 1000 } };
            expect(canonicalResearchHandoffState(state).public.source).toEqual(state.public.source);
        });
        it("rejects an excerpt that starts before the located passage", () => {
            const state = emptyResearchHandoffState();
            state.public.source = { decision, start: 100, history: [], excerpt: { text: "x".repeat(40), start: 90, end: 130, total_chars: 1000 } };
            expect(() => canonicalResearchHandoffState(state)).toThrow();
        });
        it("rejects an excerpt that extends past the 4000-character window", () => {
            const state = emptyResearchHandoffState();
            state.public.source = { decision, start: 100, history: [], excerpt: { text: "x".repeat(40), start: 4080, end: 4120, total_chars: 5000 } };
            expect(() => canonicalResearchHandoffState(state)).toThrow();
        });
    });

    describe("private library and result projection", () => {
        const selectedFull = { id: DOC, filename: "quelle.pdf", file_type: "pdf", active_version_id: VERSION, active_version_number: 3, size_bytes: 204_800 };
        const selectedMinimal = { id: "44444444-4444-4444-8444-444444444444", filename: "andere.docx", file_type: null, active_version_id: null, active_version_number: null, size_bytes: null };
        it("carries full and minimal selected-document records through unchanged", () => {
            const state = emptyResearchHandoffState(); state.private.selected = [selectedFull, selectedMinimal];
            expect(canonicalResearchHandoffState(state).private.selected).toEqual([selectedFull, selectedMinimal]);
        });
        it("rejects duplicate selected document ids regardless of case", () => {
            const state = emptyResearchHandoffState(); state.private.selected = [selectedFull, { ...selectedFull, id: selectedFull.id.toUpperCase() }];
            expect(() => canonicalResearchHandoffState(state)).toThrow();
        });

        const privateHit = { document_id: DOC, version_id: VERSION, version_number: 2, filename: "quelle.pdf", page: 4, quote: "Ein Zitat.", score: 0.87 };
        it("carries private results, document status and notices through unchanged, including as the active source", () => {
            const state = emptyResearchHandoffState();
            state.private.result = { results: [privateHit], documents: [{ document_id: DOC, version_id: VERSION, index_status: "partial", indexed_pages: 3, total_pages: 10 }], notices: ["Teilweise indexiert."] };
            state.private.source = privateHit;
            const output = canonicalResearchHandoffState(state);
            expect(output.private.result).toEqual(state.private.result);
            expect(output.private.source).toEqual(privateHit);
        });
        it("rejects a private result whose score is not a finite number", () => {
            const state = emptyResearchHandoffState();
            state.private.result = { results: [{ ...privateHit, score: NaN }], documents: [], notices: [] };
            expect(() => canonicalResearchHandoffState(state)).toThrow();
        });
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

    it.each([[400, "invalid"], [413, "invalid"], [429, "limit"], [500, "unavailable"]] as const)("maps HTTP %i to handoff code %s", async (status, code) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({}, status));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code });
    });
    it.each(["handoff_limit", "handoff_revision_limit"])("maps a 409 %s problem to a limit error rather than a conflict", async code => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ code }, 409));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "limit" });
    });
    it("treats a non-JSON content type on an otherwise-ok response as unavailable", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(meta()), { status: 200, headers: { "content-type": "text/html" } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("treats a response with no content-type header at all as unavailable", async () => {
        const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(meta()))); controller.close(); } });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("surfaces a network failure as unavailable", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("surfaces an aborted request as AbortError instead of a handoff error", async () => {
        const controller = new AbortController(); controller.abort();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));
        await expect(getResearchHandoff(ID, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });
    it("rejects a locally malformed id before any request is sent", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        await expect(getResearchHandoff("not-a-uuid")).rejects.toMatchObject({ code: "invalid" });
        expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects a mismatched record identity from metadata-only, update and acknowledge responses alike", async () => {
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ ...meta(), id: DOC }));
        await expect(getResearchHandoffMetadata(ID)).rejects.toMatchObject({ code: "unavailable" });
        await expect(updateResearchHandoff(ID, 1, emptyResearchHandoffState(), "to_word")).rejects.toMatchObject({ code: "unavailable" });
        await expect(acknowledgeResearchHandoff(ID, 1)).rejects.toMatchObject({ code: "unavailable" });
        expect(fetch).toHaveBeenCalledTimes(3);
    });
    it("rejects an out-of-range expected revision before any request is sent", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        await expect(updateResearchHandoff(ID, 0, emptyResearchHandoffState(), "to_word")).rejects.toMatchObject({ code: "invalid" });
        expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects a record whose expiry is not a parseable date", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ ...meta(), expires_at: "not-a-date" }));
        await expect(getResearchHandoffMetadata(ID)).rejects.toMatchObject({ code: "invalid" });
    });

    it("rejects a response whose declared content-length is not a plain integer", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(meta()), { status: 200, headers: { "content-type": "application/json", "content-length": "12abc" } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("rejects a response whose declared content-length exceeds the handoff budget", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(meta()), { status: 200, headers: { "content-type": "application/json", "content-length": String(RESEARCH_HANDOFF_MAX_BYTES * 2) } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("rejects a response with no readable body", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200, headers: { "content-type": "application/json" } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
    });
    it("rejects a response whose bytes are not valid UTF-8", async () => {
        const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff, 0xfe, 0xfd])); controller.close(); } });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
        await expect(getResearchHandoff(ID)).rejects.toMatchObject({ code: "unavailable" });
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

    it.each([
        ["an empty owner id", "", reference(), SCOPE],
        ["an owner id with a control character", "a\u0001b", reference(), SCOPE],
        ["a non-uuid reference id", "owner", { ...reference(), id: "not-a-uuid" }, SCOPE],
        ["a non-integer revision", "owner", { ...reference(), revision: 1.5 }, SCOPE],
        ["a revision below 1", "owner", { ...reference(), revision: 0 }, SCOPE],
        ["a revision above 32", "owner", { ...reference(), revision: 33 }, SCOPE],
        ["an unknown host", "owner", { ...reference(), host: "other" as unknown as "word" }, SCOPE],
        ["an already-expired expiry", "owner", { ...reference(), expires_at: new Date(Date.now() - 1000).toISOString() }, SCOPE],
        ["a non-date expiry", "owner", { ...reference(), expires_at: "not-a-date" }, SCOPE],
        ["a malformed Word document scope", "owner", reference(), "too-short"],
    ])("refuses to store a reference with %s", (_label, owner, bad, scope) => {
        expect(storeResearchHandoffReference(owner, bad, scope)).toBe(false);
        expect(getResearchHandoffReference(owner, bad.host, scope)).toBeNull();
    });

    it("stores and retrieves a browser-host reference without any document scope", () => {
        expect(storeResearchHandoffReference("browser-owner", reference("browser"))).toBe(true);
        expect(getResearchHandoffReference("browser-owner", "browser")?.id).toBe(ID);
    });

    it("discards a corrupted stored reference instead of trusting it", () => {
        storeResearchHandoffReference("garbled", reference(), SCOPE);
        const key = sessionStorage.key(0)!;
        sessionStorage.setItem(key, "{not json");
        expect(getResearchHandoffReference("garbled", "word", SCOPE)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
    });

    it("rejects an origin carrying embedded credentials, an unparsable origin, or a non-uuid id", () => {
        expect(researchHandoffUrl("https://user:pass@sandbox.swisslaw.io", ID)).toBeNull();
        expect(researchHandoffUrl("not a url", ID)).toBeNull();
        expect(researchHandoffUrl("https://sandbox.swisslaw.io", "not-a-uuid")).toBeNull();
    });

    it("reads a handoff id from the URL fragment when there is no query string", () => {
        expect(parseResearchHandoffLocation("", `#handoff=${ID}`)).toBe(ID);
        expect(parseResearchHandoffFragment(`#handoff=${ID}`)).toBe(ID);
        expect(parseResearchHandoffFragment("#handoff=not-a-uuid")).toBeNull();
    });

    it("ignores a handoff id anywhere outside the research page", () => {
        window.history.replaceState(null, "", `/other?handoff=${ID}`);
        expect(capturePendingResearchHandoff()).toBeNull();
        expect(sessionStorage.length).toBe(0);
    });
    it("captures nothing from the research page when no handoff id is present", () => {
        window.history.replaceState(null, "", "/research");
        expect(capturePendingResearchHandoff()).toBeNull();
        expect(sessionStorage.length).toBe(0);
    });

    it("returns null and clears a pending record once it has expired", () => {
        sessionStorage.setItem("courtos:research-handoff:pending", JSON.stringify({ id: ID, created_at: Date.now() - 3 * 60 * 60 * 1000 }));
        expect(getPendingResearchHandoff()).toBeNull();
        expect(sessionStorage.getItem("courtos:research-handoff:pending")).toBeNull();
    });
    it("returns null for a pending record whose clock looks like it runs in the future", () => {
        sessionStorage.setItem("courtos:research-handoff:pending", JSON.stringify({ id: ID, created_at: Date.now() + 60_000 }));
        expect(getPendingResearchHandoff()).toBeNull();
    });
    it("returns null for a pending record that is not well-formed JSON", () => {
        sessionStorage.setItem("courtos:research-handoff:pending", "{not json");
        expect(getPendingResearchHandoff()).toBeNull();
    });
    it("returns null when nothing is pending", () => {
        expect(getPendingResearchHandoff()).toBeNull();
    });
    it("is a no-op during server rendering", () => {
        vi.stubGlobal("window", undefined);
        expect(getPendingResearchHandoff()).toBeNull();
    });
    it("clearing a pending handoff tolerates storage that refuses removal", () => {
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(() => clearPendingResearchHandoff()).not.toThrow();
    });

    it("leaves the URL untouched when the path is not /research", () => {
        window.history.replaceState(null, "", `/elsewhere?handoff=${ID}`);
        const replaceState = vi.spyOn(window.history, "replaceState");
        clearResearchHandoffLocation();
        expect(replaceState).not.toHaveBeenCalled();
    });
    it("leaves the URL untouched on /research when it carries no handoff id", () => {
        window.history.replaceState(null, "", "/research");
        const replaceState = vi.spyOn(window.history, "replaceState");
        clearResearchHandoffLocation();
        expect(replaceState).not.toHaveBeenCalled();
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

    it("returns null when there is no saved excerpt to restore", () => {
        expect(revalidateHandoffExcerpt({ ...source, excerpt: null }, detail)).toBeNull();
    });
    it("skips the content-hash check when the saved source never recorded one", () => {
        const noHash: ResearchHandoffPublicSource = { ...source, decision: { ...decision, content_hash: null } };
        expect(revalidateHandoffExcerpt(noHash, detail)).toEqual(source.excerpt);
    });
    it("returns null when the saved excerpt starts before the refetched passage", () => {
        const corrupted: ResearchHandoffPublicSource = { ...source, excerpt: { text: quote, start: 50, end: 50 + Array.from(quote).length, total_chars: 500 } };
        expect(revalidateHandoffExcerpt(corrupted, detail)).toBeNull();
    });
    it("returns null when the saved excerpt runs past the end of the refetched passage", () => {
        const corrupted: ResearchHandoffPublicSource = { ...source, excerpt: { text: "x".repeat(58), start: 102, end: 160, total_chars: 500 } };
        expect(revalidateHandoffExcerpt(corrupted, detail)).toBeNull();
    });
    it("returns null when the refetched passage's own bounds are internally inconsistent", () => {
        const offByOne: PublicDecisionDetail = { ...detail, passage: { ...detail.passage, end: detail.passage.end + 1 } };
        expect(revalidateHandoffExcerpt(source, offByOne)).toBeNull();
        const overTotal: PublicDecisionDetail = { ...detail, passage: { ...detail.passage, total_chars: detail.passage.end - 1 } };
        expect(revalidateHandoffExcerpt(source, overTotal)).toBeNull();
    });
});
