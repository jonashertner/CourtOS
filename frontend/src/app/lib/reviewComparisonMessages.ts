import type { CourtOSText } from "./courtosLocale";

export const reviewComparisonMessages = {
    title: {de:"Aussagen und Gegenpositionen",fr:"Énoncés et positions adverses",it:"Affermazioni e posizioni contrarie",en:"Statements and opposing positions"},
    help: {de:"Die Zuordnung ist ein KI-Entwurf. Fehlt eine Gegenstelle, ist die Aussage damit nicht unbestritten. Die Zeilen sind keine vollständige Liste der Streitpunkte.",fr:"Le rapprochement est une proposition de l’IA. L’absence de passage adverse ne signifie pas que l’énoncé est incontesté. Les lignes ne constituent pas une liste exhaustive des points litigieux.",it:"L’accostamento è una proposta dell’IA. L’assenza di un passaggio contrario non rende incontestata l’affermazione. Le righe non costituiscono un elenco completo dei punti controversi.",en:"The pairing is an AI draft. A missing opposing passage does not make a statement undisputed. These rows are not a complete list of contested issues."},
    statement: {de:"Aussage {number}",fr:"Énoncé {number}",it:"Affermazione {number}",en:"Statement {number}"},
    unassignedParty: {de:"Partei nicht zugeordnet",fr:"Partie non attribuée",it:"Parte non assegnata",en:"Party not assigned"},
    noOpposition: {de:"Keine Gegenposition zugeordnet",fr:"Aucune position adverse attribuée",it:"Nessuna posizione contraria assegnata",en:"No opposing position assigned"},
} satisfies Record<string, CourtOSText>;
