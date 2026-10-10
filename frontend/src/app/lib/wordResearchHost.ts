/** Small, selection-only Office boundary. No document body, network or storage access. */
export const WORD_RESEARCH_TEXT_LIMIT = 12_000;

export interface WordResearchHost {
    readonly kind: "word";
    readSelection(): Promise<string>;
    insertTextAfterSelection(text: string): Promise<void>;
}

interface SelectionRange {
    readonly text: string;
    load(property: "text"): void;
    insertText(text: string, location: "End"): unknown;
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
        context?: { requirements?: { isSetSupported(name: string, version: string): boolean } };
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
