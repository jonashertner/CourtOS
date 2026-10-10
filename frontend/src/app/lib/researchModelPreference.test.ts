import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResearchModelPreference, setResearchModelPreference, useResearchModelPreference } from "./researchModelPreference";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("owner-bound research model preference", () => {
    it("defaults to local and does not inherit another account's external preference", () => {
        expect(getResearchModelPreference(null)).toBe("gemma");
        expect(getResearchModelPreference("owner-b")).toBe("gemma");
        expect(setResearchModelPreference("owner-a", "claude-opus-5-5")).toBe("claude-opus-5-5");
        expect(getResearchModelPreference("owner-b")).toBe("gemma");
        expect(getResearchModelPreference("owner-a")).toBe("claude-opus-5-5");
        expect(setResearchModelPreference(null, "claude-opus-5-5")).toBe("gemma");
    });

    it("rejects foreign ownership, unknown models, unsupported versions and malformed state", () => {
        setResearchModelPreference("owner-validation", "claude-opus-5-5");
        const key = localStorage.key(0)!;
        for (const raw of [
            JSON.stringify({ version: 1, ownerId: "different-owner", model: "claude-opus-5-5" }),
            JSON.stringify({ version: 1, ownerId: "owner-validation", model: "other-provider" }),
            JSON.stringify({ version: 2, ownerId: "owner-validation", model: "claude-opus-5-5" }),
            "broken", "null", "[]",
        ]) {
            localStorage.setItem(key, raw);
            expect(getResearchModelPreference("owner-validation")).toBe("gemma");
        }
    });

    it("falls back to local when reads fail", () => {
        setResearchModelPreference("owner-read-error", "claude-opus-5-5");
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(getResearchModelPreference("owner-read-error")).toBe("gemma");
    });

    it("does not retain an older external choice after a failed save and failed removal", () => {
        setResearchModelPreference("owner-write-error", "claude-opus-5-5");
        const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
        const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
        expect(setResearchModelPreference("owner-write-error", "gemma")).toBe("gemma");
        expect(getResearchModelPreference("owner-write-error")).toBe("gemma");
        write.mockRestore(); remove.mockRestore();
        expect(setResearchModelPreference("owner-write-error", "claude-opus-5-5")).toBe("claude-opus-5-5");
    });

    it("updates same-owner subscribers and switches accounts without retaining the previous model", () => {
        const first = renderHook(({ owner }) => useResearchModelPreference(owner), { initialProps: { owner: "subscriber-a" } });
        const second = renderHook(() => useResearchModelPreference("subscriber-a"));
        const other = renderHook(() => useResearchModelPreference("subscriber-b"));
        act(() => { first.result.current.setModel("claude-opus-5-5"); });
        expect(second.result.current.model).toBe("claude-opus-5-5");
        expect(other.result.current.model).toBe("gemma");
        first.rerender({ owner: "subscriber-b" });
        expect(first.result.current.model).toBe("gemma");
        first.rerender({ owner: "subscriber-a" });
        expect(first.result.current.model).toBe("claude-opus-5-5");
    });

    it("reacts to another tab clearing the stored choice", () => {
        setResearchModelPreference("owner-tab", "claude-opus-5-5");
        const key = localStorage.key(0)!;
        const { result } = renderHook(() => useResearchModelPreference("owner-tab"));
        expect(result.current.model).toBe("claude-opus-5-5");
        act(() => {
            localStorage.removeItem(key);
            window.dispatchEvent(new StorageEvent("storage", { key }));
        });
        expect(result.current.model).toBe("gemma");
    });

    it("uses local while external processing is unavailable and makes no network request", () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        setResearchModelPreference("owner-offline", "claude-opus-5-5");
        const { result } = renderHook(() => useResearchModelPreference("owner-offline", false));
        expect(result.current.model).toBe("gemma");
        act(() => { result.current.setModel("claude-opus-5-5"); });
        expect(result.current.model).toBe("gemma");
        expect(fetch).not.toHaveBeenCalled();
    });
});
