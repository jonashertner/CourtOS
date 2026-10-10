/** Small, selection-only Office boundary. No document body, network or storage access. */
export const WORD_RESEARCH_TEXT_LIMIT = 12_000;

/** Text and ordinary links only; callers cannot supply Office HTML. */
export interface WordSourceCitation {
    quote: string;
    source: string;
    pinpoint: string;
    sourceUrl?: string | null;
    pinpointUrl?: string | null;
    notes?: string[];
}

export interface WordResearchHost {
    readonly kind: "word";
    readSelection(): Promise<string>;
    insertTextAfterSelection(text: string): Promise<void>;
    insertCitationAfterSelection(citation: WordSourceCitation): Promise<void>;
}

interface SelectionRange {
    readonly text: string;
    readonly font: { name: string; size: number };
    load(property: "text" | "font/name,font/size"): void;
    insertText(text: string, location: "End"): unknown;
    insertHtml(html: string, location: "End"): { font: { name: string; size: number } };
}

/** Only the Word capabilities this adapter needs; deliberately no body/settings API. */
export interface WordResearchRuntime {
    run<T>(work: (context: {
        document: { getSelection(): SelectionRange };
        sync(): Promise<void>;
    }) => Promise<T>): Promise<T>;
}

export interface WordResearchEnvironment {
    Office?: {
        onReady(): Promise<{ host?: string | null }>;
        context?: {
            requirements?: { isSetSupported(name: string, version: string): boolean };
            document?: { url?: string };
        };
    };
    Word?: WordResearchRuntime;
}

type HostErrorCode = "not_available" | "empty_selection" | "text_too_long" | "empty_text" | "busy" | "read_failed" | "insert_failed";
const messages: Record<HostErrorCode, string> = {
    not_available: "Die Word-Verbindung ist nicht verfügbar. Sie können die Recherche im Browser verwenden.",
    empty_selection: "Markieren Sie zuerst den gewünschten Text in Word.",
    text_too_long: "Der Text ist zu lang. Bitte wählen Sie einen kürzeren Ausschnitt.",
    empty_text: "Es ist kein Text zum Einfügen vorhanden.",
    busy: "Die vorherige Word-Aktion läuft noch.",
    read_failed: "Die Auswahl konnte nicht gelesen werden. Bitte markieren Sie den Text erneut.",
    insert_failed: "Das Einfügen konnte nicht bestätigt werden. Prüfen Sie zuerst Ihr Dokument; der Text kann auch kopiert werden.",
};

export class WordResearchHostError extends Error {
    constructor(readonly code: HostErrorCode) {
        super(messages[code]);
        this.name = "WordResearchHostError";
    }
}

function checkText(text: string, emptyCode: "empty_selection" | "empty_text") {
    if (typeof text !== "string" || !text.trim()) throw new WordResearchHostError(emptyCode);
    if (text.length > WORD_RESEARCH_TEXT_LIMIT) throw new WordResearchHostError("text_too_long");
}

function citationHtml(citation: WordSourceCitation): string {
    checkText(citation.quote, "empty_text");
    checkText(citation.source, "empty_text");
    checkText(citation.pinpoint, "empty_text");
    const notes = citation.notes ?? [];
    if (!Array.isArray(notes) || notes.some(note => typeof note !== "string")) throw new WordResearchHostError("empty_text");
    checkText([citation.quote, citation.source, citation.pinpoint, ...notes, citation.sourceUrl ?? "", citation.pinpointUrl ?? ""].join("\n"), "empty_text");
    const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const text = (value: string) => escape(value).replace(/\r\n|\r|\n/g, "<br />");
    const link = (url: string | null | undefined, label: string) => {
        if (!url) return text(label);
        // Refuse unsafe links before queuing a write. Never downgrade a failed write to plain text.
        try {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\u0000-\u0020\u007f]/.test(url)) throw new Error();
            return `<a href="${escape(parsed.href)}">${text(label)}</a>`;
        } catch { throw new WordResearchHostError("insert_failed"); }
    };
    const pinpointLink = citation.pinpointUrl ? ` · ${link(citation.pinpointUrl, "Textstelle suchen")}` : "";
    // Paragraph boundaries keep the current selection and its surrounding text intact.
    // No font or size override: the citation follows the user's document formatting.
    return `<p><br /></p><p>${text(citation.quote)}</p><p>Quelle: ${link(citation.sourceUrl, citation.source)} · ${text(citation.pinpoint)}${pinpointLink}</p>${notes.length ? `<p>${notes.map(text).join("<br />")}</p>` : ""}<p><br /></p>`;
}

/** Creation is inert. The UI must call each operation from its explicit action. */
export function createWordResearchHost(runtime: WordResearchRuntime): WordResearchHost {
    let active = false;
    async function run<T>(operation: () => Promise<T>, failure: "read_failed" | "insert_failed") {
        if (active) throw new WordResearchHostError("busy");
        active = true;
        try { return await operation(); }
        catch (error) {
            // Office errors can contain selected text. Never expose or log their details.
            throw error instanceof WordResearchHostError ? error : new WordResearchHostError(failure);
        } finally { active = false; }
    }
    return {
        kind: "word",
        readSelection: () => run(() => runtime.run(async (context) => {
            const selection = context.document.getSelection();
            selection.load("text");
            await context.sync();
            checkText(selection.text, "empty_selection");
            return selection.text;
        }), "read_failed"),
        insertTextAfterSelection: (text) => run(async () => {
            checkText(text, "empty_text");
            await runtime.run(async (context) => {
                // Resolve the current selection at the moment of the click. End preserves it.
                context.document.getSelection().insertText(text, "End");
                await context.sync();
            });
        }, "insert_failed"),
        insertCitationAfterSelection: (citation) => run(async () => {
            const html = citationHtml(citation);
            await runtime.run(async (context) => {
                const selection = context.document.getSelection();
                selection.load("font/name,font/size");
                await context.sync();
                const inserted = selection.insertHtml(html, "End");
                // Word's HTML importer can choose a different default font. Apply only
                // the selection's explicit font to the new range; never reformat old text.
                if (typeof selection.font.name === "string" && selection.font.name.trim()) inserted.font.name = selection.font.name;
                if (Number.isFinite(selection.font.size) && selection.font.size > 0) inserted.font.size = selection.font.size;
                await context.sync();
            });
        }, "insert_failed"),
    };
}

/** Call only once Office.js has loaded on the dedicated Word route. Reads no text. */
export async function connectWordResearchHost(
    environment: WordResearchEnvironment = typeof window === "undefined" ? {} : window as unknown as WordResearchEnvironment,
): Promise<WordResearchHost> {
    const office = environment.Office;
    if (!office || typeof office.onReady !== "function") throw new WordResearchHostError("not_available");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const info = await Promise.race([
            office.onReady(),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new WordResearchHostError("not_available")), 10_000); }),
        ]);
        if (info.host !== "Word" || !office.context?.requirements?.isSetSupported("WordApi", "1.1") ||
            typeof environment.Word?.run !== "function") throw new WordResearchHostError("not_available");
        return createWordResearchHost(environment.Word);
    } catch {
        throw new WordResearchHostError("not_available");
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
}

/** Local reload scope only. Never sends or stores the document's path or reads its content. */
export async function getWordResearchDocumentScope(
    environment: WordResearchEnvironment = typeof window === "undefined" ? {} : window as unknown as WordResearchEnvironment,
    crypto: Pick<Crypto, "subtle"> | undefined = globalThis.crypto,
): Promise<string | null> {
    try {
        const url = environment.Office?.context?.document?.url;
        // Unsaved documents have no dependable identity: use only the live in-memory handoff.
        if (typeof url !== "string" || !url.trim() || url.length > 8192 || url.includes("\0") || !crypto?.subtle) return null;
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`courtos-word-document-v1\n${url}`));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
}
