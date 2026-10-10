import type { SourceGroundingIssue } from "@mike/contracts";
import type { CourtOSText } from "./courtosLocale";

export const sourceGroundingMessages = {
    required: {
        de: "Bitte wählen Sie zuerst Originalquellen aus.",
        fr: "Veuillez d’abord sélectionner les sources originales.",
        it: "Selezionate prima le fonti originali.",
        en: "Select original sources first.",
    },
    scope: {
        de: "Die Quellenauswahl ist für diesen Auftrag zu gross oder nicht vollständig lesbar. Bitte grenzen Sie die Auswahl ein.",
        fr: "Les sources sélectionnées sont trop volumineuses pour cette demande ou ne sont pas entièrement lisibles. Veuillez réduire la sélection.",
        it: "Le fonti selezionate sono troppo estese per questa richiesta o non sono interamente leggibili. Riducete la selezione.",
        en: "The selected sources are too large for this request or are not fully readable. Narrow the selection.",
    },
    unavailable: {
        de: "Eine ausgewählte Quelle konnte nicht erneut geladen werden. Öffnen Sie das Original und versuchen Sie es erneut.",
        fr: "Une source sélectionnée n’a pas pu être rechargée. Ouvrez l’original et réessayez.",
        it: "Non è stato possibile ricaricare una fonte selezionata. Aprite l’originale e riprovate.",
        en: "A selected source could not be loaded again. Open the original and try again.",
    },
    changed: {
        de: "Eine ausgewählte Quelle hat sich geändert oder ist nicht mehr zugänglich. Wählen Sie die Originalquelle erneut aus.",
        fr: "Une source sélectionnée a changé ou n’est plus accessible. Sélectionnez à nouveau la source originale.",
        it: "Una fonte selezionata è cambiata o non è più accessibile. Selezionate nuovamente la fonte originale.",
        en: "A selected source has changed or is no longer accessible. Select the original source again.",
    },
    verification: {
        de: "Die Antwort wurde zurückgehalten, weil die Quellenverweise nicht vollständig bestätigt werden konnten. Prüfen Sie die Originalstellen oder grenzen Sie die Frage ein.",
        fr: "La réponse n’a pas été publiée, car les références n’ont pas toutes pu être confirmées. Vérifiez les passages originaux ou précisez la question.",
        it: "La risposta non è stata pubblicata perché non tutti i riferimenti hanno potuto essere confermati. Verificate i passaggi originali o precisate la domanda.",
        en: "The answer was withheld because its source references could not all be confirmed. Check the original passages or narrow the question.",
    },
    history: {
        de: "Diese frühere Antwort wurde nicht mit der aktuellen Quellenprüfung freigegeben. Wählen Sie die Originalquellen aus und stellen Sie die Frage erneut.",
        fr: "Cette ancienne réponse n’a pas été validée selon le contrôle actuel des sources. Sélectionnez les sources originales et posez à nouveau la question.",
        it: "Questa risposta precedente non è stata rilasciata dopo l’attuale verifica delle fonti. Selezionate le fonti originali e riproponete la domanda.",
        en: "This earlier answer did not pass through the current source checks. Select the original sources and ask the question again.",
    },
} satisfies Record<SourceGroundingIssue | "history", CourtOSText>;

export function normaliseSourceGroundingIssue(value: unknown): SourceGroundingIssue | null {
    return typeof value === "string" && ["required", "scope", "unavailable", "changed", "verification"].includes(value)
        ? value as SourceGroundingIssue : null;
}

/** Fixed codes only. Never display a server response body or unknown issue as UI prose. */
export function sourceGroundingText(code: unknown, issue?: unknown): CourtOSText | null {
    if (code === "source_required") return sourceGroundingMessages.required;
    if (code === "source_history_withheld") return sourceGroundingMessages.history;
    if (code === "source_grounding_failed") return sourceGroundingMessages[normaliseSourceGroundingIssue(issue) ?? "verification"];
    return null;
}
