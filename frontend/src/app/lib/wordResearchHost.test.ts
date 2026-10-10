import { afterEach, describe, expect, it, vi } from "vitest";
import { connectWordResearchHost, createWordResearchHost, WORD_RESEARCH_TEXT_LIMIT, type WordResearchEnvironment, type WordResearchRuntime } from "./wordResearchHost";

function fixture(text = "Nur die markierte Passage") {
    const selection = { text, load: vi.fn(), insertText: vi.fn() };
    const getSelection = vi.fn(() => selection);
    const bodyRead = vi.fn(() => { throw new Error("Whole document must never be accessed"); });
    const document = { getSelection, get body() { return bodyRead(); } };
    const sync = vi.fn(async () => {});
    const run = vi.fn(async <T>(work: Parameters<WordResearchRuntime["run"]>[0]) => work({ document, sync }) as Promise<T>);
    const runtime = { run } as WordResearchRuntime;
    return { selection, getSelection, bodyRead, sync, run, runtime };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("CourtOS Word selection boundary", () => {
    it("does nothing on creation and reads exactly the selected text only when asked", async () => {
        const f = fixture("  wortgetreu\rAbsatz  ");
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const host = createWordResearchHost(f.runtime);
        expect(f.run).not.toHaveBeenCalled();
        expect(await host.readSelection()).toBe("  wortgetreu\rAbsatz  ");
        expect(f.selection.load).toHaveBeenCalledExactlyOnceWith("text");
        expect(f.sync).toHaveBeenCalledOnce();
        expect(f.bodyRead).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("waits for Word to load the selection before reading its text", async () => {
        const f = fixture("");
        f.sync.mockImplementation(async () => { f.selection.text = "Geladene Auswahl"; });
        expect(await createWordResearchHost(f.runtime).readSelection()).toBe("Geladene Auswahl");
    });

    it.each(["", " \r\n "])("refuses an empty selection without falling back to the document (%j)", async (text) => {
        const f = fixture(text);
        await expect(createWordResearchHost(f.runtime).readSelection()).rejects.toMatchObject({ code: "empty_selection" });
        expect(f.bodyRead).not.toHaveBeenCalled();
    });

    it("refuses an oversized selection without truncating or requesting other text", async () => {
        const f = fixture("x".repeat(WORD_RESEARCH_TEXT_LIMIT + 1));
        await expect(createWordResearchHost(f.runtime).readSelection()).rejects.toMatchObject({ code: "text_too_long" });
        expect(f.getSelection).toHaveBeenCalledOnce();
        expect(f.bodyRead).not.toHaveBeenCalled();
    });

    it("inserts exact plain text at the current selection end without reading or replacing it", async () => {
        const f = fixture();
        const text = '<b>Kein HTML</b>\nQuelle: BGer, 1C_1/2020';
        await createWordResearchHost(f.runtime).insertTextAfterSelection(text);
        expect(f.selection.insertText).toHaveBeenCalledExactlyOnceWith(text, "End");
        expect(f.selection.load).not.toHaveBeenCalled();
        expect(f.sync).toHaveBeenCalledOnce();
        expect(f.bodyRead).not.toHaveBeenCalled();
    });

    it.each(["", " ", "x".repeat(WORD_RESEARCH_TEXT_LIMIT + 1)])("rejects invalid insertion before invoking Word", async (text) => {
        const f = fixture();
        await expect(createWordResearchHost(f.runtime).insertTextAfterSelection(text)).rejects.toMatchObject({ name: "WordResearchHostError" });
        expect(f.run).not.toHaveBeenCalled();
    });

    it("does not queue a second insertion while Word is still confirming the first", async () => {
        const f = fixture(); let finish!: () => void;
        f.sync.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
        const host = createWordResearchHost(f.runtime);
        const first = host.insertTextAfterSelection("Quelle");
        await expect(host.insertTextAfterSelection("Quelle")).rejects.toMatchObject({ code: "busy" });
        expect(f.selection.insertText).toHaveBeenCalledOnce();
        finish(); await first;
    });

    it("does not retry an uncertain insertion or expose Office errors containing document text", async () => {
        const f = fixture();
        f.sync.mockRejectedValue(new Error("Confidential excerpt in Office debugInfo"));
        const host = createWordResearchHost(f.runtime);
        await expect(host.insertTextAfterSelection("Quelle")).rejects.toMatchObject({ code: "insert_failed", message: expect.stringContaining("Prüfen Sie zuerst Ihr Dokument") });
        expect(f.run).toHaveBeenCalledOnce();
        await expect(host.readSelection()).rejects.toMatchObject({ code: "read_failed", message: expect.not.stringContaining("Confidential") });
    });
});

describe("CourtOS Word host connection", () => {
    const environment = (f: ReturnType<typeof fixture>, host: string | null = "Word", supported = true): WordResearchEnvironment => ({
        Office: { onReady: vi.fn(async () => ({ host })), context: { requirements: { isSetSupported: vi.fn(() => supported) } } },
        Word: f.runtime,
    });

    it("checks host readiness and WordApi 1.1 without touching document content", async () => {
        const f = fixture(); const env = environment(f);
        expect((await connectWordResearchHost(env)).kind).toBe("word");
        expect(env.Office?.context?.requirements?.isSetSupported).toHaveBeenCalledWith("WordApi", "1.1");
        expect(f.run).not.toHaveBeenCalled();
    });

    it.each([null, "Excel"])("does not treat a browser or another Office host as Word (%s)", async (name) => {
        const f = fixture();
        await expect(connectWordResearchHost(environment(f, name))).rejects.toMatchObject({ code: "not_available" });
        expect(f.run).not.toHaveBeenCalled();
    });

    it("fails closed when Office, Word or the required API is unavailable", async () => {
        await expect(connectWordResearchHost({})).rejects.toMatchObject({ code: "not_available" });
        const f = fixture();
        await expect(connectWordResearchHost(environment(f, "Word", false))).rejects.toMatchObject({ code: "not_available" });
        const env = environment(f); delete env.Word;
        await expect(connectWordResearchHost(env)).rejects.toMatchObject({ code: "not_available" });
    });

    it("bounds a host readiness wait and ignores a later response", async () => {
        vi.useFakeTimers(); const f = fixture(); const env = environment(f);
        env.Office!.onReady = () => new Promise(() => {});
        const result = expect(connectWordResearchHost(env)).rejects.toMatchObject({ code: "not_available" });
        await vi.advanceTimersByTimeAsync(10_000); await result;
        expect(f.run).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
