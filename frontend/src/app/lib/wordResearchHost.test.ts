import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { connectWordResearchHost, createWordResearchHost, getWordResearchDocumentScope, WORD_RESEARCH_TEXT_LIMIT, type WordResearchEnvironment, type WordResearchRuntime } from "./wordResearchHost";

function fixture(text = "Nur die markierte Passage") {
    const inserted = { font: { name: "Times New Roman", size: 11 } };
    const selection = { text, font: { name: "Aptos", size: 12 }, load: vi.fn(), insertText: vi.fn(), insertHtml: vi.fn<(html: string, location: "End") => typeof inserted>(() => inserted) };
    const getSelection = vi.fn(() => selection);
    const bodyRead = vi.fn(() => { throw new Error("Whole document must never be accessed"); });
    const document = { getSelection, get body() { return bodyRead(); } };
    const sync = vi.fn(async () => {});
    const run = vi.fn(async <T>(work: Parameters<WordResearchRuntime["run"]>[0]) => work({ document, sync }) as Promise<T>);
    const runtime = { run } as WordResearchRuntime;
    return { selection, inserted, getSelection, bodyRead, sync, run, runtime };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Word document-local reload scope", () => {
    it("escapes translated citation labels without changing the quote, destination or document font", async()=>{
        const f=fixture();const host=createWordResearchHost(f.runtime);
        await host.insertCitationAfterSelection({quote:"Texte original <exact>",source:"Arrêt",pinpoint:"page 2",sourceUrl:"https://example.org/source#page=2",pinpointUrl:"https://example.org/source#:~:text=exact",sourceLabel:"Fonte <sic>",pinpointLinkLabel:"Cerca & verifica"});
        const html=f.selection.insertHtml.mock.calls[0][0];
        expect(html).toContain("Fonte &lt;sic&gt;");expect(html).toContain("Cerca &amp; verifica");expect(html).toContain("Texte original &lt;exact&gt;");expect(html).toContain("https://example.org/source#page=2");expect(f.selection.insertHtml).toHaveBeenCalledOnce();
    });
    it("hashes saved-document metadata locally and never reads content or sends the path", async () => {
        const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
        const env = (url: string): WordResearchEnvironment => ({ Office: { onReady: vi.fn(), context: { document: { url } } } });
        const crypt = webcrypto as unknown as Crypto;
        const one = await getWordResearchDocumentScope(env("file:///private/one.docx"), crypt);
        expect(one).toMatch(/^[a-f0-9]{64}$/);
        expect(await getWordResearchDocumentScope(env("file:///private/one.docx"), crypt)).toBe(one);
        expect(await getWordResearchDocumentScope(env("file:///private/two.docx"), crypt)).not.toBe(one);
        expect(fetch).not.toHaveBeenCalled();
    });
    it("does not invent a persistent scope for unsaved or unavailable documents", async () => {
        expect(await getWordResearchDocumentScope({})).toBeNull();
        expect(await getWordResearchDocumentScope({ Office: { onReady: vi.fn(), context: { document: { url: "" } } } })).toBeNull();
    });
    it("treats a hashing failure as no durable scope rather than throwing", async () => {
        const crypt = { subtle: { digest: vi.fn().mockRejectedValue(new Error("hashing unavailable")) } } as unknown as Pick<Crypto, "subtle">;
        const env: WordResearchEnvironment = { Office: { onReady: vi.fn(), context: { document: { url: "file:///private/one.docx" } } } };
        expect(await getWordResearchDocumentScope(env, crypt)).toBeNull();
    });
    it("resolves the environment and crypto default from the global scope when called without arguments", async () => {
        await expect(connectWordResearchHost()).rejects.toMatchObject({ code: "not_available" });
        expect(await getWordResearchDocumentScope()).toBeNull();
    });
    it("defaults to an empty environment in a non-browser runtime", async () => {
        const win = globalThis.window;
        // @ts-expect-error simulate SSR
        delete globalThis.window;
        try {
            await expect(connectWordResearchHost()).rejects.toMatchObject({ code: "not_available" });
            expect(await getWordResearchDocumentScope()).toBeNull();
        } finally {
            globalThis.window = win;
        }
    });
});

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

    it("appends an escaped quotation and compact clickable provenance without displaying long URLs", async () => {
        const f = fixture();
        const quote = '<script>kein HTML</script> & "wortgetreu"';
        const sourceUrl = 'https://example.org/entscheid?key=a&other=%22test%22';
        const pinpointUrl = `${sourceUrl}#:~:text=${encodeURIComponent(quote)}`;
        await createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote, source: 'Gericht <I> & "Quelle"', pinpoint: 'Version 2, PDF-Seite 7', sourceUrl, pinpointUrl, notes: ['Position <nicht geprüft> & Original ansehen.'] });
        expect(f.selection.insertHtml).toHaveBeenCalledExactlyOnceWith(expect.any(String), "End");
        const html = f.selection.insertHtml.mock.calls[0][0];
        const fragment = document.createElement('div'); fragment.innerHTML = html;
        expect(fragment.querySelector('script')).toBeNull();
        expect(fragment.querySelector('i')).toBeNull();
        expect(fragment.querySelectorAll('a')).toHaveLength(2);
        expect(fragment.querySelectorAll('p')[1].textContent).toBe(quote);
        expect(fragment.querySelectorAll('a')[0].textContent).toBe('Gericht <I> & "Quelle"');
        expect(fragment.querySelectorAll('a')[0].getAttribute('href')).toBe(sourceUrl);
        expect(fragment.querySelectorAll('a')[1].getAttribute('href')).toBe(pinpointUrl);
        expect(fragment.querySelectorAll('a')[1].textContent).toBe('Textstelle suchen');
        expect(fragment.textContent).toContain('Version 2, PDF-Seite 7');
        expect(fragment.textContent).toContain('Position <nicht geprüft> & Original ansehen.');
        expect(fragment.textContent).not.toContain('https://');
        expect(f.selection.insertText).not.toHaveBeenCalled();
        expect(f.selection.load).toHaveBeenCalledExactlyOnceWith("font/name,font/size");
        expect(f.inserted.font).toEqual({ name: "Aptos", size: 12 });
        expect(f.selection.font).toEqual({ name: "Aptos", size: 12 });
        expect(f.bodyRead).not.toHaveBeenCalled();
    });

    it("does not insert anything when the current font cannot be read", async () => {
        const f = fixture(); f.sync.mockRejectedValue(new Error("private format context"));
        await expect(createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote: "Zitat", source: "Quelle", pinpoint: "Seite 1" })).rejects.toMatchObject({ code: "insert_failed" });
        expect(f.selection.insertHtml).not.toHaveBeenCalled(); expect(f.selection.insertText).not.toHaveBeenCalled();
    });

    it("keeps quote line breaks and immutable private source/page URLs", async () => {
        const f = fixture();
        const sourceUrl = 'https://court.example/sources/library/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222?page=7';
        await createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote: 'Zeile eins\r\nZeile zwei\nZeile drei', source: 'Beilage.pdf', pinpoint: 'Version 2, PDF-Seite 7', sourceUrl });
        const fragment = document.createElement('div'); fragment.innerHTML = f.selection.insertHtml.mock.calls[0][0];
        expect(fragment.querySelectorAll('p')[1].innerHTML).toBe('Zeile eins<br>Zeile zwei<br>Zeile drei');
        expect(fragment.querySelector('a')?.getAttribute('href')).toBe(sourceUrl);
    });

    it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'file:///tmp/source.pdf', '//example.org/source', 'https://user:password@example.org/source', 'https://example.org/\nsource'])("rejects unsafe citation links before any Word write (%s)", async sourceUrl => {
        const f = fixture();
        await expect(createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote: 'Zitat', source: 'Quelle', pinpoint: 'Seite 1', sourceUrl })).rejects.toMatchObject({ code: 'insert_failed' });
        expect(f.run).not.toHaveBeenCalled();
        expect(f.selection.insertText).not.toHaveBeenCalled();
    });

    it.each([
        { label: "a non-array value", notes: "not an array" as unknown as string[] },
        { label: "an array containing a non-string entry", notes: ["ok", 5] as unknown as string[] },
    ])("rejects citation notes that are not a plain string array ($label)", async ({ notes }) => {
        const f = fixture();
        await expect(createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote: "Zitat", source: "Quelle", pinpoint: "Seite 1", notes })).rejects.toMatchObject({ code: "empty_text" });
        expect(f.run).not.toHaveBeenCalled();
    });

    it("uses the current selection on insertion, not a stale range from the earlier search", async () => {
        const f = fixture(); const host = createWordResearchHost(f.runtime);
        await host.readSelection();
        const current = { text: 'Neue Auswahl', font: { name: "Arial", size: 10 }, load: vi.fn(), insertText: vi.fn(), insertHtml: vi.fn<(html: string, location: "End") => typeof f.inserted>(() => f.inserted) };
        f.getSelection.mockReturnValue(current);
        await host.insertCitationAfterSelection({ quote: 'Zitat', source: 'Quelle', pinpoint: 'Seite 1' });
        expect(current.insertHtml).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'End');
        expect(f.selection.insertHtml).not.toHaveBeenCalled();
        expect(current.load).toHaveBeenCalledExactlyOnceWith("font/name,font/size");
        expect(f.inserted.font).toEqual({ name: "Arial", size: 10 });
    });

    it("never retries or falls back to plain text after an uncertain rich insertion", async () => {
        const f = fixture(); let reject!: (error: Error) => void;
        f.sync.mockResolvedValueOnce(undefined).mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
        const host = createWordResearchHost(f.runtime);
        const citation = { quote: 'Zitat', source: 'Quelle', pinpoint: 'Seite 1' };
        const first = host.insertCitationAfterSelection(citation);
        const failed = expect(first).rejects.toMatchObject({ code: 'insert_failed', message: expect.not.stringContaining('sensitive') });
        await expect(host.insertCitationAfterSelection(citation)).rejects.toMatchObject({ code: 'busy' });
        await Promise.resolve();
        reject(new Error('sensitive Office error')); await failed;
        expect(f.run).toHaveBeenCalledOnce();
        expect(f.selection.insertHtml).toHaveBeenCalledOnce();
        expect(f.selection.insertText).not.toHaveBeenCalled();
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

    it("does not override the inserted citation's font when the selection's font is unreadable", async () => {
        const f = fixture();
        f.selection.font = { name: "", size: NaN };
        await createWordResearchHost(f.runtime).insertCitationAfterSelection({ quote: "Zitat", source: "Quelle", pinpoint: "Seite 1" });
        expect(f.inserted.font).toEqual({ name: "Times New Roman", size: 11 });
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

    it("skips clearing a timer that was never scheduled when Office rejects before readiness starts", async () => {
        vi.useFakeTimers(); const f = fixture(); const env = environment(f);
        env.Office!.onReady = () => { throw new Error("Office failed to initialize"); };
        await expect(connectWordResearchHost(env)).rejects.toMatchObject({ code: "not_available" });
        expect(vi.getTimerCount()).toBe(0);
    });
});
