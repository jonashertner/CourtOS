import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    consumeFrontierReturnDraft, FRONTIER_DRAFT_LIFETIME_MS, FRONTIER_OUTBOUND_KEY,
    FRONTIER_RETURN_KEY, getFrontierReturnDraft, prepareFrontierDraft,
} from "./frontierDraft";

const now = 1_800_000_000_000;
const payload = () => ({ version: 1, ownerId: "user-a", createdAt: now, text: "Prüfung mit Quelle [1].", chatId: "chat-a" });
beforeEach(() => { sessionStorage.clear(); vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("frontier browser hand-off", () => {
    it("stores the exact approved draft under the current owner without a request", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const text = "  Wörtlicher Text\nmit Absatz.\n";
        expect(prepareFrontierDraft("user-a", text, "chat-a")).toBe(true);
        expect(JSON.parse(sessionStorage.getItem(FRONTIER_OUTBOUND_KEY)!)).toEqual({ ...payload(), text });
        expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects empty/oversized drafts without silently truncating or overwriting a valid draft", () => {
        expect(prepareFrontierDraft("user-a", "vorhanden")).toBe(true);
        const saved = sessionStorage.getItem(FRONTIER_OUTBOUND_KEY);
        expect(prepareFrontierDraft("user-a", "x".repeat(12_001))).toBe(false);
        expect(prepareFrontierDraft("user-a", " ")).toBe(false);
        expect(prepareFrontierDraft("", "text")).toBe(false);
        expect(sessionStorage.getItem(FRONTIER_OUTBOUND_KEY)).toBe(saved);
    });
    it.each([
        { ownerId: "user-b" }, { version: 2 }, { createdAt: now - FRONTIER_DRAFT_LIFETIME_MS - 1 },
        { createdAt: now + 1 }, { createdAt: "today" }, { text: "x".repeat(12_001) }, { text: " " }, { chatId: {} },
    ])("rejects foreign, expired or malformed return data: %j", (change) => {
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify({ ...payload(), ...change }));
        expect(getFrontierReturnDraft("user-a")).toBeNull();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
    });
    it("rejects a missing owner id without clearing a stored return", () => {
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify(payload()));
        expect(getFrontierReturnDraft("")).toBeNull();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).not.toBeNull();
    });
    it.each([null, 42, "text", [1, 2, 3]])("rejects non-object stored return state %j", (value) => {
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify(value));
        expect(getFrontierReturnDraft("user-a")).toBeNull();
        expect(sessionStorage.getItem(FRONTIER_RETURN_KEY)).toBeNull();
    });
    it("rejects invalid JSON and accepts a valid return only for its owner", () => {
        sessionStorage.setItem(FRONTIER_RETURN_KEY, "{broken");
        expect(getFrontierReturnDraft("user-a")).toBeNull();
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify(payload()));
        expect(getFrontierReturnDraft("user-a")).toEqual(payload());
    });
    it("accepts a return draft without a chat id", () => {
        const withoutChat: Partial<ReturnType<typeof payload>> = payload();
        delete withoutChat.chatId;
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify(withoutChat));
        expect(getFrontierReturnDraft("user-a")).toEqual(withoutChat);
    });
    it("consumes only the prepared return and preserves a replacement", () => {
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify(payload()));
        const current = getFrontierReturnDraft("user-a")!;
        sessionStorage.setItem(FRONTIER_RETURN_KEY, JSON.stringify({ ...payload(), text: "newer" }));
        consumeFrontierReturnDraft(current);
        expect(getFrontierReturnDraft("user-a")?.text).toBe("newer");
        consumeFrontierReturnDraft(getFrontierReturnDraft("user-a")!);
        expect(getFrontierReturnDraft("user-a")).toBeNull();
    });
    it("returns a recoverable failure if browser storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(prepareFrontierDraft("user-a", "Text")).toBe(false);
    });
});
