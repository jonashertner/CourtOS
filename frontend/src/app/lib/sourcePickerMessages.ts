import type { CourtOSText } from "./courtosLocale";

export const sourcePickerMessages = {
    root: { de: "Alle Akten", fr: "Tous les dossiers", it: "Tutti i fascicoli", en: "All matters" },
    folders: { de: "Akten und Ordner", fr: "Dossiers et répertoires", it: "Fascicoli e cartelle", en: "Matters and folders" },
    rootPath: { de: "Bibliothek · Hauptebene", fr: "Bibliothèque · niveau principal", it: "Biblioteca · livello principale", en: "Library · top level" },
    pathLoading: { de: "Ordnerpfad wird geladen…", fr: "Chargement du chemin…", it: "Caricamento del percorso…", en: "Loading folder path…" },
    pathUnknown: { de: "Ordnerpfad nicht verfügbar", fr: "Chemin du dossier indisponible", it: "Percorso della cartella non disponibile", en: "Folder path unavailable" },
    mixed: { de: "Auswahl aus mehreren Hauptordnern: {folders}.", fr: "Sources sélectionnées dans plusieurs dossiers principaux : {folders}.", it: "Fonti selezionate da più cartelle principali: {folders}.", en: "Sources selected from several top-level folders: {folders}." },
    clearSearch: { de: "Zur Ordneransicht", fr: "Revenir aux dossiers", it: "Torna alle cartelle", en: "Back to folders" },
    searchScope: { de: "Dateinamensuche in der ganzen Bibliothek", fr: "Recherche par nom dans toute la bibliothèque", it: "Ricerca per nome in tutta la biblioteca", en: "Filename search across the library" },
} satisfies Record<string, CourtOSText>;
