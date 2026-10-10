import type { CourtOSText } from "./courtosLocale";

export const citationControlMessages = {
    citation: {de:"Fundstelle",fr:"Référence",it:"Riferimento",en:"Citation"},
    page: {de:"Seite",fr:"Page",it:"Pagina",en:"Page"},
    pdfPage: {de:"PDF-Seite",fr:"page PDF",it:"pagina PDF",en:"PDF page"},
    quotes: {de:"Zitate",fr:"Citations",it:"Citazioni",en:"Quotes"},
    empty: {de:"Keine Zitate zugeordnet.",fr:"Aucune citation attribuée.",it:"Nessuna citazione assegnata.",en:"No relevant quotes."},
    close: {de:"Schliessen",fr:"Fermer",it:"Chiudi",en:"Close"},
    closeTitle: {de:"Fundstelle schliessen",fr:"Fermer la référence",it:"Chiudi il riferimento",en:"Close citation"},
    view: {de:"Anzeigen",fr:"Afficher",it:"Mostra",en:"View"},
    cite: {de:"Zitat kopieren",fr:"Copier la citation",it:"Copia la citazione",en:"Cite"},
    citeTitle: {de:"Zitat und Quellenangabe kopieren",fr:"Copier la citation et la référence",it:"Copia la citazione e il riferimento",en:"Copy Quote and Citation"},
    copied: {de:"Kopiert",fr:"Copié",it:"Copiato",en:"Copied"},
    copyText: {de:"Text kopieren",fr:"Copier le texte",it:"Copia il testo",en:"Copy text"},
    limited: {de:"Kopie ohne vollständige Quellenangabe.",fr:"Copie sans référence complète à la source.",it:"Copia senza riferimento completo alla fonte.",en:"Copy without a complete source reference."},
    version: {de:"Version",fr:"Version",it:"Versione",en:"Version"},
    original: {de:"Original",fr:"Original",it:"Originale",en:"Original"},
    copyResponse: {de:"Antwort kopieren",fr:"Copier la réponse",it:"Copia la risposta",en:"Copy response"},
    responseCopied: {de:"Antwort kopiert",fr:"Réponse copiée",it:"Risposta copiata",en:"Response copied"},
    download: {de:"Herunterladen",fr:"Télécharger",it:"Scarica",en:"Download"},
    downloadFailed: {de:"Download fehlgeschlagen",fr:"Échec du téléchargement",it:"Download non riuscito",en:"Download failed"},
    downloadRetry: {de:"Die Datei konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.",fr:"Le fichier n’a pas pu être téléchargé. Veuillez réessayer.",it:"Non è stato possibile scaricare il file. Riprovate.",en:"This file could not be downloaded. Please try again."},
} satisfies Record<string, CourtOSText>;
