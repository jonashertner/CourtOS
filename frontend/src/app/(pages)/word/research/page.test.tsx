import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    enabled: true,
    connect: vi.fn(),
    script: null as null | { src: string; onReady: () => void; onLoad: () => void; onError: () => void },
}));
vi.mock("next/script", () => ({ default: (props: typeof state.script) => { state.script = props; return null; } }));
vi.mock("@/app/lib/courtos", () => ({ get COURTOS_KNOWLEDGE_ENABLED() { return state.enabled; } }));
vi.mock("@/app/lib/wordResearchHost", async (original) => ({ ...(await original<object>()), connectWordResearchHost: state.connect }));
vi.mock("@/app/components/courtos/KnowledgeWorkspace", () => ({
    KnowledgeWorkspace: ({ wordHost, wordHostError }: { wordHost: unknown; wordHostError?: string }) => <div><p>{wordHost ? "Word bereit" : "Recherche ohne Dokumentzugriff"}</p>{wordHostError && <p role="alert">{wordHostError}</p>}</div>,
}));
import WordResearchPage from "./page";

const originalPush = window.history.pushState;
const originalReplace = window.history.replaceState;
beforeEach(() => { state.enabled = true; state.script = null; state.connect.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); window.history.pushState = originalPush; window.history.replaceState = originalReplace; });

describe("Word research route", () => {
    it("loads Office on this route, keeps research available, and reads nothing during connection", async () => {
        const host = { kind: "word", readSelection: vi.fn(), insertTextAfterSelection: vi.fn() };
        state.connect.mockResolvedValue(host);
        render(<WordResearchPage />);
        expect(screen.getByText("Recherche ohne Dokumentzugriff")).toBeVisible();
        expect(state.script?.src).toBe("https://appsforoffice.microsoft.com/lib/1/hosted/office.js");
        expect(state.connect).not.toHaveBeenCalled();
        await act(async () => { state.script!.onReady(); });
        expect(await screen.findByText("Word bereit")).toBeVisible();
        expect(host.readSelection).not.toHaveBeenCalled();
        expect(host.insertTextAfterSelection).not.toHaveBeenCalled();
    });

    it("restores the existing router history methods after Office.js nulls them", async () => {
        state.connect.mockResolvedValue({ kind: "word" });
        render(<WordResearchPage />);
        window.history.pushState = null as unknown as History["pushState"];
        window.history.replaceState = null as unknown as History["replaceState"];
        act(() => { state.script!.onLoad(); });
        expect(window.history.pushState).toBe(originalPush);
        expect(window.history.replaceState).toBe(originalReplace);
        const newerWrapper = vi.fn(); window.history.pushState = newerWrapper;
        await act(async () => { state.script!.onReady(); });
        expect(window.history.pushState).toBe(newerWrapper);
    });

    it("keeps browser research available when the Office script or host fails", async () => {
        render(<WordResearchPage />);
        act(() => { state.script!.onError(); });
        expect(screen.getByRole("alert")).toHaveTextContent("Word-Verbindung ist nicht verfügbar");
        expect(screen.getByText("Recherche ohne Dokumentzugriff")).toBeVisible();
        expect(state.connect).not.toHaveBeenCalled();
        state.connect.mockRejectedValue(new Error("secret Office payload"));
        await act(async () => { state.script!.onReady(); });
        expect(screen.queryByText("secret Office payload")).toBeNull();
    });

    it("does not load Office when the research feature is disabled", async () => {
        state.enabled = false; render(<WordResearchPage />);
        await waitFor(() => expect(screen.getByText(/nicht freigeschaltet/)).toBeVisible());
        expect(state.script).toBeNull();
        expect(state.connect).not.toHaveBeenCalled();
    });
});
