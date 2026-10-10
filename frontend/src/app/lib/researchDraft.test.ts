import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeResearchDraft, getResearchDraft, prepareResearchDraft, RESEARCH_DRAFT_KEY, RESEARCH_DRAFT_LIFETIME_MS } from "./researchDraft";
const now = 1_800_000_000_000;
const payload = () => ({ version: 1, ownerId: "user-a", createdAt: now, text: "Frage mit wörtlichem Auszug und Beleg." });
beforeEach(() => { sessionStorage.clear(); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });
describe("local research hand-off", () => {
    it("stores exact text only, without making a request", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        expect(prepareResearchDraft("user-a", payload().text)).toBe(true);
        expect(JSON.parse(sessionStorage.getItem(RESEARCH_DRAFT_KEY)!)).toEqual(payload());
        expect(getResearchDraft("user-a")).toEqual(payload());
        expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects oversize input instead of truncating an existing saved draft", () => {
        prepareResearchDraft("user-a", "Keep me");
        for (const text of [" ", "x".repeat(12_001)]) expect(prepareResearchDraft("user-a", text)).toBe(false);
        expect(prepareResearchDraft("", "text")).toBe(false);
        expect(getResearchDraft("user-a")?.text).toBe("Keep me");
    });
    it.each([{ ownerId: "user-b" }, { createdAt: now + 1 }, { createdAt: now - RESEARCH_DRAFT_LIFETIME_MS - 1 }, { version: 2 }, { text: "" }, { text: 12 }, { createdAt: "bad" }])("rejects invalid/foreign state %j", (change) => {
        sessionStorage.setItem(RESEARCH_DRAFT_KEY, JSON.stringify({ ...payload(), ...change }));
        expect(getResearchDraft("user-a")).toBeNull();
        expect(sessionStorage.getItem(RESEARCH_DRAFT_KEY)).toBeNull();
    });
    it("claims only the prepared text, preserving a newer replacement", () => {
        prepareResearchDraft("user-a", "first"); const first = getResearchDraft("user-a")!;
        prepareResearchDraft("user-a", "second"); consumeResearchDraft(first);
        expect(getResearchDraft("user-a")?.text).toBe("second");
        consumeResearchDraft(getResearchDraft("user-a")!); expect(getResearchDraft("user-a")).toBeNull();
    });
    it("handles malformed JSON and unavailable browser storage", () => {
        sessionStorage.setItem(RESEARCH_DRAFT_KEY, "broken"); expect(getResearchDraft("user-a")).toBeNull();
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
        expect(prepareResearchDraft("user-a", "text")).toBe(false);
    });
});
