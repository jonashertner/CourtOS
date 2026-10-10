import type { CourtOSText } from "./courtosLocale";

export const publicCitationMessages = {
    literal: {de:"Wortlaut an der Fundstelle geprüft. Die rechtliche Aussage ist damit nicht bestätigt.",fr:"Libellé vérifié à l’emplacement indiqué. Cela ne confirme pas l’analyse juridique.",it:"Testo verificato nel punto indicato. Ciò non conferma la valutazione giuridica.",en:"Wording checked at the cited location. This does not verify the legal proposition."},
    noHash: {de:"Die Quelle liefert keinen Fingerabdruck; eine dauerhaft unveränderte Fassung ist nicht belegt.",fr:"La source ne fournit pas d’empreinte ; la permanence de cette version n’est pas établie.",it:"La fonte non fornisce un’impronta; la permanenza di questa versione non è attestata.",en:"The source supplies no fingerprint; a permanently unchanged version is not established."},
    offsets: {de:"Unicode-Zeichen im OpenCaseLaw-Text, ab 0, Ende ausgeschlossen; keine amtliche Seiten- oder Randnummer.",fr:"Caractères Unicode dans le texte OpenCaseLaw, à partir de 0, fin exclue ; ni page ni paragraphe officiel.",it:"Caratteri Unicode nel testo OpenCaseLaw, da 0, estremo finale escluso; non sono pagine o paragrafi ufficiali.",en:"Unicode characters in the OpenCaseLaw text, starting at 0, end excluded; not official page or paragraph numbers."},
    original: {de:"Originalquelle",fr:"Source originale",it:"Fonte originale",en:"Original source"},
    originalPdf: {de:"Original-PDF",fr:"PDF original",it:"PDF originale",en:"Original PDF"},
    fingerprint: {de:"Quellen-Fingerabdruck",fr:"Empreinte de la source",it:"Impronta della fonte",en:"Source fingerprint"},
    sources: {de:"Quellen",fr:"Sources",it:"Fonti",en:"Sources"},
} satisfies Record<string, CourtOSText>;
