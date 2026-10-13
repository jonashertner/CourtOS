import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicDecision, publicSourceUrl, searchKnowledge, searchPublicKnowledge } from "./knowledgeApi";

afterEach(() => vi.unstubAllGlobals());
describe("explicit knowledge requests", () => {
    it.each([
        [503, "public_research_timeout", "präzisere Begriffe"],
        [503, "public_research_busy", "kurz warten"],
        [400, "public_research_invalid_query", "ein bis acht"],
        [503, "unknown_error", "vorübergehend nicht verfügbar"],
        [500, "public_research_timeout", "vorübergehend nicht verfügbar"],
    ])("shows fixed actionable public-search errors (%s/%s)", async (status, code, message) => {
        vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ code, detail: "private raw backend details" }), { status: Number(status) })));
        await expect(searchPublicKnowledge("Gehör", "de")).rejects.toThrow(String(message));
        await expect(searchPublicKnowledge("Gehör", "de")).rejects.not.toThrow("private raw backend details");
    });
    it("falls back to a generic AbortError when an already-aborted signal carries no reason", async () => {
        const signal = { aborted: true } as unknown as AbortSignal;
        await expect(searchPublicKnowledge("Gehör", "de", signal)).rejects.toMatchObject({ name: "AbortError", message: "Aborted" });
    });
    it("sends only selected IDs and the local query, with the cookie session", async () => {
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] })));
        vi.stubGlobal("fetch", fetch);
        await searchKnowledge("Stellungnahme", ["own-document"]);
        expect(fetch).toHaveBeenCalledWith("/api/knowledge/search", expect.objectContaining({
            method: "POST", credentials: "include", cache: "no-store",
            body: JSON.stringify({ query: "Stellungnahme", document_ids: ["own-document"], limit: 12 }),
        }));
    });
    it("keeps the public request limited to its own entered terms and language", async () => {
        const fetch = vi.fn().mockImplementation(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
        await searchPublicKnowledge("rechtliches Gehör", "de");
        expect(fetch).toHaveBeenCalledWith("/api/knowledge/public/search", expect.objectContaining({
            body: JSON.stringify({ query: "rechtliches Gehör", limit: 5, language: "de" }),
        }));
        await searchPublicKnowledge("audition", "");
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ query: "audition", limit: 5 });
    });
    it("encodes a public decision ID rather than interpolating a path", async () => {
        const fetch = vi.fn().mockImplementation(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
        await getPublicDecision("CH/../../case?foo", 4000);
        expect(fetch.mock.calls[0][0]).toBe("/api/knowledge/public/decisions/CH%2F..%2F..%2Fcase%3Ffoo?start=4000&length=4000");
    });
    it.each([401, 403, 404, 400, 409, 422, 429, 503])("does not expose a raw error response (%s)", async (status) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private raw backend details", { status })));
        await expect(searchKnowledge("term", ["doc"])).rejects.toThrow(/Sitzung|Quelle|prüfen|ausgelastet|verfügbar/);
        await expect(searchKnowledge("term", ["doc"])).rejects.not.toThrow("private raw backend details");
    });
    it("makes a changed document snapshot actionable without exposing internal details", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "private version identifiers" }), { status: 409 })));
        await expect(searchKnowledge("Gehör", ["selected-document"])).rejects.toThrow("Bitte den Bestand aktualisieren und erneut suchen");
    });
    it("permits normal source URLs and rejects script and credential URLs", () => {
        expect(publicSourceUrl("https://example.org/decision")).toBe("https://example.org/decision");
        expect(publicSourceUrl("http://example.org/decision")).toBe("http://example.org/decision");
        for (const value of [null, "", "javascript:alert(1)", "data:text/html,x", "https://secret@example.org/", "/api/private"]) expect(publicSourceUrl(value)).toBeNull();
    });
});
