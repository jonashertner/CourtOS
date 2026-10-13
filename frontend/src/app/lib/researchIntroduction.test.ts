import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
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

    it("ignores continuation when no account is present", () => {
        const view = renderHook(() => useResearchIntroduction(null));
        act(() => view.result.current.continueToResearch());
        expect(view.result.current.showIntroduction).toBe(true);
        expect(localStorage.length).toBe(0);
    });

    it("reacts to a matching storage key and a cross-tab clear signal, while ignoring an unrelated key", () => {
        const view = renderHook(() => useResearchIntroduction("storage-owner"));
        const key = "courtos:research:introduction:v1:storage-owner";
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-key" })));
        expect(view.result.current.showIntroduction).toBe(true);
        act(() => {
            localStorage.setItem(key, JSON.stringify({ version: 1, ownerId: "storage-owner", continued: true }));
            window.dispatchEvent(new StorageEvent("storage", { key }));
        });
        expect(view.result.current.showIntroduction).toBe(false);
        act(() => {
            localStorage.removeItem(key);
            window.dispatchEvent(new StorageEvent("storage", { key: null }));
        });
        expect(view.result.current.showIntroduction).toBe(true);
        view.unmount();
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

    it("shows the introduction in server-rendered markup, whatever the browser stored", () => {
        const { result } = renderHook(() => useResearchIntroduction("server-reader"));
        act(() => result.current.continueToResearch());
        const Probe = () => createElement("span", null, String(useResearchIntroduction("server-reader").showIntroduction));
        expect(renderToString(createElement(Probe))).toBe("<span>true</span>");
    });
});
