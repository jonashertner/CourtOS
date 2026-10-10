import type { Document } from "@/app/components/shared/types";

type KnowledgeDraft = { owner: string; created: number; prompt: string; documents: Document[] };
let pending: KnowledgeDraft | null = null;
const LIFETIME_MS = 5 * 60 * 1000;

/** Mirrors bounded original-PDF admission; extraction and page coverage stay server-side. */
export function knowledgeAnalysisIssue(documents: Document[]): string | null {
    if (!documents.length) return "Wählen Sie zuerst die PDF-Quellen für die Analyse aus.";
    if (documents.length > 5) return "Für eine belegte Analyse höchstens fünf PDF-Dateien auswählen. Die Textsuche bleibt für die ganze Auswahl verfügbar.";
    if (documents.some(document => document.status !== "ready" || !document.current_version_id)) return "Mindestens eine Quelle ist noch nicht bereit oder hat keine gespeicherte Fassung. Aktualisieren Sie den Bestand, sobald die Verarbeitung abgeschlossen ist.";
    if (documents.some(document => !/\.pdf$/i.test(document.filename) && !["pdf", "application/pdf"].includes(document.file_type?.toLowerCase() ?? ""))) return "Für eine belegte Analyse bitte ursprüngliche PDF-Dateien auswählen. Word-, Tabellen- und Präsentationsdateien bleiben für die Bibliothekssuche verfügbar.";
    return null;
}

/** A same-tab hand-off, never persisted in browser storage or a URL. */
export function prepareKnowledgeDraft(owner: string, question: string, documents: Document[]) {
    if (!owner || !question.trim() || knowledgeAnalysisIssue(documents)) return false;
    pending = {
        owner, created: Date.now(), documents: documents.map((document) => ({ ...document })),
        prompt: `Frage: ${question.trim()}\n\nSuche gezielt in den beigefügten Quellen. Begründe die Antwort mit wörtlichen Belegen, Dokument, Fassung und Seite. Unterscheide belegte Aussagen, abweichende Aussagen und offene Fragen. Weise auf nicht erfasste oder nicht lesbare Stellen hin. Erfinde keine Quellen und keinen Entscheid.`,
    };
    return true;
}

/** A chronology reads the complete selected set; top-ranked search hits are insufficient. */
export function prepareChronologyDraft(owner: string, documents: Document[]) {
    if (!owner || knowledgeAnalysisIssue(documents)) return false;
    pending = {
        owner, created: Date.now(), documents: documents.map(document => ({ ...document })),
        prompt: `Erstelle eine Chronologie der Tatsachenbehauptungen der Parteien aus sämtlichen ausgewählten Dokumenten. Verwende ausschliesslich deren vollständig bereitgestellten Text. Wenn Quellen oder Seiten fehlen, beginne keine scheinbar vollständige Chronologie; benenne den fehlenden Umfang.

Erstelle eine Tabelle mit Datum oder Zeitraum | behaupteter Vorgang | Partei beziehungsweise Urheber | abweichende Darstellung oder Unsicherheit | genauer Beleg. Sortiere nach dem behaupteten Ereignisdatum, nicht nach dem Datum der Eingabe. Erfinde kein Tagesdatum für ungefähre Angaben. Führe Vorgänge ohne bestimmbares Datum gesondert auf. Das Datum eines Dokuments ist nur dann ein Ereignisdatum, wenn die Quelle das trägt.

Jede Zeile benötigt einen wörtlichen Beleg aus der richtigen Dokumentfassung und PDF-Seite. Belege abweichende Darstellungen separat. Gib Parteien so wieder, wie sie in der Quelle bezeichnet sind; eine nicht erkennbare Zuordnung bleibt offen. Kennzeichne Parteibehauptungen als Behauptungen. Eine Behauptung, ein Bestreiten und ein Beweismittel sind unterschiedliche Angaben; entscheide weder Wahrheit noch Glaubwürdigkeit oder Beweislast. Keine erfundenen Ereignisse, Rechtsregeln oder Belege. Nenne am Ende den tatsächlich gelesenen Dokument- und Seitenumfang. Keine ungefragte Folgefrage.`,
    };
    return true;
}

export function getKnowledgeDraft(owner: string) {
    if (!pending) return null;
    if (pending.owner !== owner || Date.now() - pending.created > LIFETIME_MS) { pending = null; return null; }
    return pending;
}

export function consumeKnowledgeDraft(draft: NonNullable<ReturnType<typeof getKnowledgeDraft>>) {
    if (pending === draft) pending = null;
}
