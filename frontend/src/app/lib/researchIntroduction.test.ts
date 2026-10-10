import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasContinuedToResearch, useResearchIntroduction } from "./researchIntroduction";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("owner-bound first research encounter", () => {
    it("remembers only an explicit continuation, separately for each account", () => {
        const view = renderHook(({ owner }) => useResearchIntroduction(owner), { initialProps: { owner: "reader-a" } });
        expect(view.result.current.showIntroduction).toBe(true);
        expect(localStorage.length).toBe(0);
        act(() => view.result.current.continueToResearch());
        expect(hasContinuedToResearch("reader-a")).toBe(true);
        expect(view.result.current.showIntroduction).toBe(false);
        view.rerender({ owner: "reader-b" });
        expect(view.result.current.showIntroduction).toBe(true);
        expect(hasContinuedToResearch("reader-b")).toBe(false);
        view.rerender({ owner: "reader-a" });
        expect(view.result.current.showIntroduction).toBe(false);
    });

    it("allows continuation with blocked storage, without leaking that choice across accounts", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        const view = renderHook(({ owner }) => useResearchIntroduction(owner), { initialProps: { owner: "blocked-a" } });
        expect(view.result.current.showIntroduction).toBe(true);
        act(() => view.result.current.continueToResearch());
        expect(view.result.current.showIntroduction).toBe(false);
        view.rerender({ owner: "blocked-b" });
        expect(view.result.current.showIntroduction).toBe(true);
    });

    it("rejects malformed, future-version and foreign-owner records", () => {
        const view = renderHook(() => useResearchIntroduction("validation-owner"));
        act(() => view.result.current.continueToResearch());
        const key = localStorage.key(0)!;
        for (const value of ["broken", "null", "[]", JSON.stringify({ version: 2, ownerId: "validation-owner", continued: true }), JSON.stringify({ version: 1, ownerId: "another-owner", continued: true })]) {
            localStorage.setItem(key, value);
            expect(hasContinuedToResearch("validation-owner")).toBe(false);
        }
        expect(hasContinuedToResearch(null)).toBe(false);
    });

    it("notifies only same-account views and stores no reading history or personal content", () => {
        const first = renderHook(() => useResearchIntroduction("shared-reader"));
        const second = renderHook(() => useResearchIntroduction("shared-reader"));
        const other = renderHook(() => useResearchIntroduction("other-reader"));
        act(() => first.result.current.continueToResearch());
        expect(second.result.current.showIntroduction).toBe(false);
        expect(other.result.current.showIntroduction).toBe(true);
        expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!)).toEqual({ version: 1, ownerId: "shared-reader", continued: true });
    });
});
