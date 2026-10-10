import type { CourtOSText } from "./courtosLocale";

/** Interface text only; source quotations and model instructions remain unchanged. */
export const researchMessages = {
    "research": {
        "de": "Recherche",
        "fr": "Recherche",
        "it": "Ricerca",
        "en": "Research"
    },
    "review": {
        "de": "Eingaben prüfen",
        "fr": "Examiner les écritures",
        "it": "Esaminare gli atti",
        "en": "Review submissions"
    },
    "library": {
        "de": "Bibliothek",
        "fr": "Bibliothèque",
        "it": "Biblioteca",
        "en": "Library"
    },
    "citations": {
        "de": "Zitate",
        "fr": "Citations",
        "it": "Citazioni",
        "en": "Citations"
    },
    "checkCitations": {
        "de": "Zitate prüfen",
        "fr": "Vérifier les citations",
        "it": "Verifica le citazioni",
        "en": "Check citations"
    },
    "openCitecheck": {
        "de": "Citecheck öffnen",
        "fr": "Ouvrir Citecheck",
        "it": "Apri Citecheck",
        "en": "Open Citecheck"
    },
    "settings": {
        "de": "Einstellungen",
        "fr": "Paramètres",
        "it": "Impostazioni",
        "en": "Settings"
    },
    "skip": {
        "de": "Zum Inhalt",
        "fr": "Aller au contenu",
        "it": "Vai al contenuto",
        "en": "Skip to content"
    },
    "areas": {
        "de": "Recherchebereiche",
        "fr": "Espaces de recherche",
        "it": "Aree di ricerca",
        "en": "Research areas"
    },
    "loadingResearch": {
        "de": "Recherche wird geladen…",
        "fr": "Chargement de la recherche…",
        "it": "Caricamento della ricerca…",
        "en": "Loading research…"
    },
    "pilot": {
        "de": "Testbetrieb · Keine vertraulichen Unterlagen",
        "fr": "Version de test · Aucun document confidentiel",
        "it": "Versione di prova · Nessun documento riservato",
        "en": "Test service · No confidential documents"
    },
    "signOutFailed": {
        "de": "Die Abmeldung ist gerade nicht möglich. Bitte versuchen Sie es erneut.",
        "fr": "La déconnexion est momentanément impossible. Veuillez réessayer.",
        "it": "Al momento non è possibile uscire. Riprovate.",
        "en": "Unable to sign out at the moment. Please try again."
    },
    "sourceCode": {
        "de": "Quellcode · AGPL-3.0",
        "fr": "Code source · AGPL-3.0",
        "it": "Codice sorgente · AGPL-3.0",
        "en": "Source code · AGPL-3.0"
    },
    "browserDestination": {
        "de": "Browser",
        "fr": "Navigateur",
        "it": "Browser",
        "en": "Browser"
    },
    "continueBrowser": {
        "de": "Im Browser fortsetzen",
        "fr": "Continuer dans le navigateur",
        "it": "Continua nel browser",
        "en": "Continue in browser"
    },
    "continueWord": {
        "de": "In Word fortsetzen",
        "fr": "Continuer dans Word",
        "it": "Continua in Word",
        "en": "Continue in Word"
    },
    "openBrowser": {
        "de": "Recherche im Browser öffnen",
        "fr": "Ouvrir la recherche dans le navigateur",
        "it": "Apri la ricerca nel browser",
        "en": "Open research in browser"
    },
    "acceptBrowser": {
        "de": "Browserstand übernehmen",
        "fr": "Reprendre la version du navigateur",
        "it": "Usa lo stato del browser",
        "en": "Use browser state"
    },
    "keepLocal": {
        "de": "Hier weiterarbeiten",
        "fr": "Continuer ici",
        "it": "Continua qui",
        "en": "Continue here"
    },
    "handoffConflict": {
        "de": "Im Browser weiterbearbeitet. Hier bestehen eigene Änderungen.",
        "fr": "Modifié dans le navigateur. Des modifications existent aussi ici.",
        "it": "Modificato nel browser. Anche qui sono presenti modifiche.",
        "en": "Changed in the browser. You also have changes here."
    },
    "handoffReady": {
        "de": "Recherche bereit.",
        "fr": "Recherche prête.",
        "it": "Ricerca pronta.",
        "en": "Research ready."
    },
    "acceptedBrowser": {
        "de": "Browserstand übernommen.",
        "fr": "Version du navigateur reprise.",
        "it": "Stato del browser ripreso.",
        "en": "Browser state restored."
    },
    "acceptedWord": {
        "de": "Recherche aus Word übernommen.",
        "fr": "Recherche de Word reprise.",
        "it": "Ricerca da Word ripresa.",
        "en": "Research restored from Word."
    },
    "ackFailed": {
        "de": "Recherche übernommen; die Rückmeldung konnte nicht bestätigt werden.",
        "fr": "Recherche reprise ; la confirmation n’a pas pu être transmise.",
        "it": "Ricerca ripresa; non è stato possibile confermare la ricezione.",
        "en": "Research restored; acknowledgement could not be confirmed."
    },
    "documentChanged": {
        "de": "Word-Dokument gewechselt. Recherche erneut verbinden.",
        "fr": "Document Word changé. Reliez à nouveau la recherche.",
        "it": "Documento Word cambiato. Collegate di nuovo la ricerca.",
        "en": "Word document changed. Reconnect research."
    },
    "handoffUnavailable": {
        "de": "Diese Recherche ist für das angemeldete Konto nicht mehr verfügbar.",
        "fr": "Cette recherche n’est plus disponible pour le compte connecté.",
        "it": "Questa ricerca non è più disponibile per l’account connesso.",
        "en": "This research is no longer available to the signed-in account."
    },
    "readyBrowser": {
        "de": "Im Browser bereit.",
        "fr": "Prêt dans le navigateur.",
        "it": "Pronto nel browser.",
        "en": "Ready in browser."
    },
    "readyWord": {
        "de": "In Word bereit. Wechseln Sie zu Word.",
        "fr": "Prêt dans Word. Revenez à Word.",
        "it": "Pronto in Word. Tornate a Word.",
        "en": "Ready in Word. Switch to Word."
    },
    "handoffFailed": {
        "de": "Die Recherche konnte nicht übertragen werden. Ihr aktueller Stand bleibt erhalten.",
        "fr": "La recherche n’a pas pu être transférée. Votre travail actuel est conservé.",
        "it": "Non è stato possibile trasferire la ricerca. Lo stato attuale è conservato.",
        "en": "Research could not be transferred. Your current work is preserved."
    },
    "keptLocal": {
        "de": "Eigener Stand beibehalten.",
        "fr": "Votre version est conservée.",
        "it": "Stato locale mantenuto.",
        "en": "Local state kept."
    },
    "keepFailed": {
        "de": "Die Auswahl konnte nicht bestätigt werden. Ihr aktueller Stand bleibt erhalten.",
        "fr": "Le choix n’a pas pu être confirmé. Votre travail actuel est conservé.",
        "it": "Non è stato possibile confermare la scelta. Lo stato attuale è conservato.",
        "en": "Your choice could not be confirmed. Your current work is preserved."
    },
    "handoffInvalid": {
        "de": "Dieser Recherchestand kann nicht übertragen werden. Bitte die Auswahl verkleinern.",
        "fr": "Cette recherche ne peut pas être transférée. Réduisez la sélection.",
        "it": "Questo stato non può essere trasferito. Riducete la selezione.",
        "en": "This research state cannot be transferred. Reduce the selection."
    },
    "handoffAccount": {
        "de": "Dieser Recherchestand ist abgelaufen oder für dieses Konto nicht verfügbar. Verwenden Sie in Word und im Browser dasselbe Konto.",
        "fr": "Cette recherche a expiré ou n’est pas disponible pour ce compte. Utilisez le même compte dans Word et le navigateur.",
        "it": "Questa ricerca è scaduta o non è disponibile per questo account. Usate lo stesso account in Word e nel browser.",
        "en": "This research has expired or is unavailable to this account. Use the same account in Word and the browser."
    },
    "handoffStale": {
        "de": "Der Recherchestand wurde inzwischen geändert. Bitte den neueren Stand prüfen, bevor Sie ihn ersetzen.",
        "fr": "La recherche a été modifiée entre-temps. Vérifiez la nouvelle version avant de la remplacer.",
        "it": "La ricerca è stata modificata nel frattempo. Controllate lo stato più recente prima di sostituirlo.",
        "en": "Research has changed since then. Check the newer state before replacing it."
    },
    "handoffLimit": {
        "de": "Zu viele Recherchestände sind noch offen. Bitte später erneut versuchen.",
        "fr": "Trop de recherches sont encore ouvertes. Réessayez plus tard.",
        "it": "Troppe ricerche sono ancora aperte. Riprovate più tardi.",
        "en": "Too many research sessions are still open. Try again later."
    },
    "handoffExpired": {
        "de": "Dieser Recherchestand ist abgelaufen. Bitte erneut aus Word öffnen.",
        "fr": "Cette recherche a expiré. Ouvrez-la à nouveau depuis Word.",
        "it": "Questa ricerca è scaduta. Riapritela da Word.",
        "en": "This research has expired. Open it again from Word."
    },
    "loadingDocument": {
        "de": "Dokument wird geöffnet…",
        "fr": "Ouverture du document…",
        "it": "Apertura del documento…",
        "en": "Opening document…"
    },
    "insertWord": {
        "de": "In Word einfügen",
        "fr": "Insérer dans Word",
        "it": "Inserisci in Word",
        "en": "Insert in Word"
    },
    "insertedWord": {
        "de": "In Word eingefügt.",
        "fr": "Inséré dans Word.",
        "it": "Inserito in Word.",
        "en": "Inserted in Word."
    },
    "insertUncertain": {
        "de": "Einfügen nicht bestätigt. Prüfen Sie zuerst das Word-Dokument; der Text könnte bereits eingefügt sein.",
        "fr": "Insertion non confirmée. Vérifiez d’abord le document Word ; le texte peut déjà y figurer.",
        "it": "Inserimento non confermato. Controllate prima il documento Word: il testo potrebbe essere già inserito.",
        "en": "Insertion not confirmed. Check the Word document first; the text may already have been inserted."
    },
    "copied": {
        "de": "Kopiert. In Ihrem Dokument einfügen.",
        "fr": "Copié. Collez le texte dans votre document.",
        "it": "Copiato. Incollate nel vostro documento.",
        "en": "Copied. Paste into your document."
    },
    "manualCopy": {
        "de": "Die Zwischenablage ist nicht verfügbar. Text hier markieren und kopieren.",
        "fr": "Le presse-papiers est indisponible. Sélectionnez et copiez le texte ici.",
        "it": "Gli appunti non sono disponibili. Selezionate e copiate il testo qui.",
        "en": "Clipboard unavailable. Select and copy the text here."
    },
    "copyText": {
        "de": "Text zum manuellen Kopieren",
        "fr": "Texte à copier manuellement",
        "it": "Testo da copiare manualmente",
        "en": "Text to copy manually"
    },
    "closeSource": {
        "de": "Quelle schliessen",
        "fr": "Fermer la source",
        "it": "Chiudi la fonte",
        "en": "Close source"
    },
    "ownSources": {
        "de": "Eigene Quellen",
        "fr": "Vos sources",
        "it": "Fonti proprie",
        "en": "Your sources"
    },
    "localSearchLocation": {
        "de": "Textsuche ohne KI · Verarbeitung auf dem Server",
        "fr": "Recherche textuelle sans IA · Traitement sur le serveur",
        "it": "Ricerca testuale senza IA · Elaborazione sul server",
        "en": "Text search without AI · Processed on the server"
    },
    "addDocuments": {
        "de": "Dokumente hinzufügen",
        "fr": "Ajouter des documents",
        "it": "Aggiungi documenti",
        "en": "Add documents"
    },
    "refreshLibrary": {
        "de": "Bestand aktualisieren",
        "fr": "Actualiser les documents",
        "it": "Aggiorna i documenti",
        "en": "Refresh documents"
    },
    "selectSources": {
        "de": "Quellenauswahl",
        "fr": "Sélection des sources",
        "it": "Selezione delle fonti",
        "en": "Source selection"
    },
    "filename": {
        "de": "Dateiname",
        "fr": "Nom du fichier",
        "it": "Nome del file",
        "en": "Filename"
    },
    "filterFilenames": {
        "de": "Dateinamen filtern",
        "fr": "Filtrer les noms de fichiers",
        "it": "Filtra i nomi dei file",
        "en": "Filter filenames"
    },
    "selectedDocuments": {
        "de": "Ausgewählte Dokumente",
        "fr": "Documents sélectionnés",
        "it": "Documenti selezionati",
        "en": "Selected documents"
    },
    "loadingLibrary": {
        "de": "Bibliothek wird geladen…",
        "fr": "Chargement de la bibliothèque…",
        "it": "Caricamento della biblioteca…",
        "en": "Loading library…"
    },
    "libraryFailed": {
        "de": "Die Bibliothek konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
        "fr": "La bibliothèque n’a pas pu être chargée. Veuillez réessayer.",
        "it": "Non è stato possibile caricare la biblioteca. Riprovate.",
        "en": "Unable to load the library. Please try again."
    },
    "noFilename": {
        "de": "Kein Dokument mit diesem Dateinamen gefunden.",
        "fr": "Aucun document portant ce nom de fichier.",
        "it": "Nessun documento con questo nome di file.",
        "en": "No document with this filename."
    },
    "noDocuments": {
        "de": "Noch keine Dokumente. Fügen Sie Ihre Quellen hinzu.",
        "fr": "Aucun document pour le moment. Ajoutez vos sources.",
        "it": "Non ci sono ancora documenti. Aggiungete le vostre fonti.",
        "en": "No documents yet. Add your sources."
    },
    "currentVersion": {
        "de": "Aktuelle Version",
        "fr": "Version actuelle",
        "it": "Versione attuale",
        "en": "Current version"
    },
    "back": {
        "de": "Zurück",
        "fr": "Précédent",
        "it": "Indietro",
        "en": "Back"
    },
    "next": {
        "de": "Weiter",
        "fr": "Suivant",
        "it": "Avanti",
        "en": "Next"
    },
    "textSearch": {
        "de": "Textsuche",
        "fr": "Recherche textuelle",
        "it": "Ricerca testuale",
        "en": "Text search"
    },
    "terms": {
        "de": "Suchbegriffe",
        "fr": "Termes de recherche",
        "it": "Termini di ricerca",
        "en": "Search terms"
    },
    "scanHelp": {
        "de": "Durchsucht den erfassten Text. Bildscans benötigen eine Textebene.",
        "fr": "Recherche dans le texte extrait. Les numérisations doivent contenir une couche texte.",
        "it": "Cerca nel testo estratto. Le scansioni devono avere un livello testuale.",
        "en": "Searches extracted text. Scanned images need a text layer."
    },
    "searchingPassages": {
        "de": "Passagen werden gesucht…",
        "fr": "Recherche de passages…",
        "it": "Ricerca dei passaggi…",
        "en": "Searching passages…"
    },
    "searchSelection": {
        "de": "Auswahl durchsuchen",
        "fr": "Rechercher dans la sélection",
        "it": "Cerca nella selezione",
        "en": "Search selected sources"
    },
    "continueGemma": {
        "de": "Mit Gemma weiterarbeiten",
        "fr": "Poursuivre avec Gemma",
        "it": "Continua con Gemma",
        "en": "Continue with Gemma"
    },
    "pdfHelp": {
        "de": "Bis zu fünf PDF-Dateien mit auslesbarem Text.",
        "fr": "Jusqu’à cinq fichiers PDF avec du texte extractible.",
        "it": "Fino a cinque file PDF con testo estraibile.",
        "en": "Up to five PDF files with extractable text."
    },
    "askSelection": {
        "de": "Mit dieser Auswahl fragen",
        "fr": "Poser une question sur cette sélection",
        "it": "Fai una domanda sulla selezione",
        "en": "Ask about these sources"
    },
    "chronology": {
        "de": "Chronologie erstellen",
        "fr": "Établir une chronologie",
        "it": "Crea una cronologia",
        "en": "Create chronology"
    },
    "assistantDraftHelp": {
        "de": "Öffnet Auftrag und Quellenauswahl. Erst im Assistenten senden.",
        "fr": "Ouvre la demande et les sources sélectionnées. L’envoi se fait dans l’assistant.",
        "it": "Apre la richiesta e le fonti selezionate. L’invio avviene nell’assistente.",
        "en": "Opens the request and selected sources. Send only from the assistant."
    },
    "localSearchRunning": {
        "de": "Die Dokumenttexte werden auf dem CourtOS-Server durchsucht · ohne KI.",
        "fr": "Recherche dans les documents sur le serveur CourtOS · sans IA.",
        "it": "Ricerca nei documenti sul server CourtOS · senza IA.",
        "en": "Searching document text on the CourtOS server · without AI."
    },
    "localResults": {
        "de": "Lokale Suchergebnisse",
        "fr": "Résultats locaux",
        "it": "Risultati locali",
        "en": "Local search results"
    },
    "coverage": {
        "de": "Umfang der erfassten Quellen prüfen",
        "fr": "Vérifier la couverture des sources",
        "it": "Verifica la copertura delle fonti",
        "en": "Check source coverage"
    },
    "textReady": {
        "de": "Text erfasst",
        "fr": "Texte extrait",
        "it": "Testo estratto",
        "en": "Text extracted"
    },
    "textPartial": {
        "de": "Nur teilweise erfasst",
        "fr": "Texte partiellement extrait",
        "it": "Testo estratto parzialmente",
        "en": "Partially extracted"
    },
    "textUnreadable": {
        "de": "Kein durchsuchbarer Text",
        "fr": "Aucun texte exploitable",
        "it": "Nessun testo ricercabile",
        "en": "No searchable text"
    },
    "noPassage": {
        "de": "Keine passende Passage in den erfassten Seiten. Versuchen Sie einen anderen Begriff und prüfen Sie oben den Erfassungsumfang.",
        "fr": "Aucun passage correspondant dans les pages extraites. Essayez un autre terme et vérifiez la couverture ci-dessus.",
        "it": "Nessun passaggio corrispondente nelle pagine estratte. Provate un altro termine e verificate la copertura sopra.",
        "en": "No matching passage in the extracted pages. Try another term and check coverage above."
    },
    "openEvidence": {
        "de": "Beleg im Dokument öffnen",
        "fr": "Ouvrir le passage dans le document",
        "it": "Apri il riscontro nel documento",
        "en": "Open passage in document"
    },
    "copyPassage": {
        "de": "Passage und Quelle kopieren",
        "fr": "Copier le passage et sa source",
        "it": "Copia il passaggio e la fonte",
        "en": "Copy passage and source"
    },
    "wholeOriginal": {
        "de": "Ganzes Original",
        "fr": "Original intégral",
        "it": "Originale completo",
        "en": "Full original"
    },
    "wholePdf": {
        "de": "Ganzes Original-PDF",
        "fr": "PDF original intégral",
        "it": "PDF originale completo",
        "en": "Full original PDF"
    },
    "restoreExcerptFailed": {
        "de": "Die übernommene Textstelle konnte nicht bestätigt werden. Bitte erneut markieren.",
        "fr": "Le passage repris n’a pas pu être confirmé. Sélectionnez-le à nouveau.",
        "it": "Non è stato possibile confermare il passaggio ripreso. Selezionatelo di nuovo.",
        "en": "The restored passage could not be confirmed. Select it again."
    },
    "loadingDecision": {
        "de": "Entscheidtext wird geladen…",
        "fr": "Chargement de la décision…",
        "it": "Caricamento della decisione…",
        "en": "Loading decision text…"
    },
    "retry": {
        "de": "Erneut laden",
        "fr": "Recharger",
        "it": "Ricarica",
        "en": "Reload"
    },
    "estimatedDate": {
        "de": "Das Entscheidungsdatum ist im Quellenbestand nur geschätzt.",
        "fr": "La date de la décision est estimée dans les données sources.",
        "it": "La data della decisione è stimata nei dati di origine.",
        "en": "The decision date is only estimated in the source data."
    },
    "selectPassage": {
        "de": "Kurze Textstelle markieren (20–800 Zeichen).",
        "fr": "Sélectionnez un court passage (20 à 800 caractères).",
        "it": "Selezionate un breve passaggio (20–800 caratteri).",
        "en": "Select a short passage (20–800 characters)."
    },
    "decisionText": {
        "de": "Erfasster Entscheidtext",
        "fr": "Texte de la décision extrait",
        "it": "Testo estratto della decisione",
        "en": "Extracted decision text"
    },
    "selectPassageError": {
        "de": "Bitte eine zusammenhängende Textstelle mit 20–800 Zeichen im Entscheidtext markieren.",
        "fr": "Sélectionnez un passage continu de 20 à 800 caractères dans la décision.",
        "it": "Selezionate un passaggio continuo di 20–800 caratteri nella decisione.",
        "en": "Select one continuous passage of 20–800 characters in the decision."
    },
    "useSelection": {
        "de": "Markierte Stelle übernehmen",
        "fr": "Reprendre le passage sélectionné",
        "it": "Usa il passaggio selezionato",
        "en": "Use selected passage"
    },
    "selectedPassage": {
        "de": "Ausgewählte Textstelle",
        "fr": "Passage sélectionné",
        "it": "Passaggio selezionato",
        "en": "Selected passage"
    },
    "findOriginal": {
        "de": "Textstelle im Original suchen",
        "fr": "Rechercher le passage dans l’original",
        "it": "Cerca il passaggio nell’originale",
        "en": "Find passage in original"
    },
    "jumpDepends": {
        "de": "Der Textsprung hängt von Website und Browser ab.",
        "fr": "L’accès direct au passage dépend du site et du navigateur.",
        "it": "Il collegamento al passaggio dipende dal sito e dal browser.",
        "en": "Text navigation depends on the website and browser."
    },
    "noJump": {
        "de": "Für diese Quelle steht kein Textsprung zur Verfügung. Die Stelle im ganzen Original prüfen.",
        "fr": "L’accès direct au passage n’est pas disponible. Vérifiez-le dans l’original intégral.",
        "it": "Il collegamento diretto non è disponibile. Verificate il passaggio nell’originale completo.",
        "en": "Direct text navigation is unavailable. Check the passage in the full original."
    },
    "copySelected": {
        "de": "Textstelle und Quelle kopieren",
        "fr": "Copier le passage et sa source",
        "it": "Copia il passaggio e la fonte",
        "en": "Copy selected text and source"
    },
    "localDraftFailed": {
        "de": "Der Auszug konnte nicht übergeben werden. Bitte kopieren Sie ihn in den lokalen Assistenten.",
        "fr": "L’extrait n’a pas pu être transmis. Copiez-le dans l’assistant local.",
        "it": "Non è stato possibile trasferire l’estratto. Copiatelo nell’assistente locale.",
        "en": "The excerpt could not be transferred. Copy it into the local assistant."
    },
    "frontierDraftFailed": {
        "de": "Der Auszug konnte nicht übergeben werden. Bitte die Frontier-Prüfung separat öffnen.",
        "fr": "L’extrait n’a pas pu être transmis. Ouvrez séparément l’analyse Frontier.",
        "it": "Non è stato possibile trasferire l’estratto. Aprite separatamente l’analisi Frontier.",
        "en": "The excerpt could not be transferred. Open Frontier review separately."
    },
    "checkGemma": {
        "de": "Mit Gemma prüfen",
        "fr": "Examiner avec Gemma",
        "it": "Esamina con Gemma",
        "en": "Review with Gemma"
    },
    "checkOpus": {
        "de": "Mit Opus prüfen",
        "fr": "Examiner avec Opus",
        "it": "Esamina con Opus",
        "en": "Review with Opus"
    },
    "previousSection": {
        "de": "Vorheriger Abschnitt",
        "fr": "Section précédente",
        "it": "Sezione precedente",
        "en": "Previous section"
    },
    "nextSection": {
        "de": "Nächster Abschnitt",
        "fr": "Section suivante",
        "it": "Sezione successiva",
        "en": "Next section"
    },
    "provenance": {
        "de": "Quellennachweis",
        "fr": "Provenance",
        "it": "Provenienza",
        "en": "Provenance"
    },
    "notGiven": {
        "de": "nicht angegeben",
        "fr": "non indiqué",
        "it": "non indicato",
        "en": "not provided"
    },
    "publicTerms": {
        "de": "Suchbegriffe oder Entscheidnummer",
        "fr": "Mots-clés ou référence de décision",
        "it": "Parole chiave o numero della decisione",
        "en": "Search terms or decision number"
    },
    "legalTerms": {
        "de": "Rechtsbegriffe",
        "fr": "Termes juridiques",
        "it": "Termini giuridici",
        "en": "Legal terms"
    },
    "searching": {
        "de": "Suche läuft…",
        "fr": "Recherche en cours…",
        "it": "Ricerca in corso…",
        "en": "Searching…"
    },
    "search": {
        "de": "Suchen",
        "fr": "Rechercher",
        "it": "Cerca",
        "en": "Search"
    },
    "aiSearchHelp": {
        "de": "KI-gestützte Suche · Bis zu acht Begriffe",
        "fr": "Recherche assistée par IA · Jusqu’à huit termes",
        "it": "Ricerca assistita dall’IA · Fino a otto termini",
        "en": "AI-assisted search · Up to eight terms"
    },
    "language": {
        "de": "Sprache",
        "fr": "Langue",
        "it": "Lingua",
        "en": "Language"
    },
    "allLanguages": {
        "de": "Alle Sprachen",
        "fr": "Toutes les langues",
        "it": "Tutte le lingue",
        "en": "All languages"
    },
    "german": {
        "de": "Deutsch",
        "fr": "Allemand",
        "it": "Tedesco",
        "en": "German"
    },
    "french": {
        "de": "Französisch",
        "fr": "Français",
        "it": "Francese",
        "en": "French"
    },
    "italian": {
        "de": "Italienisch",
        "fr": "Italien",
        "it": "Italiano",
        "en": "Italian"
    },
    "publicConsent": {
        "de": "Mit «Suchen» werden Ihre Begriffe übermittelt. Keine vertraulichen Angaben eingeben.",
        "fr": "« Rechercher » transmet vos termes. Ne saisissez aucune information confidentielle.",
        "it": "« Cerca » trasmette i vostri termini. Non inserite informazioni riservate.",
        "en": "“Search” sends your terms. Do not enter confidential information."
    },
    "wordSelectionLimit": {
        "de": "Bitte bis zu acht Rechtsbegriffe in Word markieren.",
        "fr": "Sélectionnez jusqu’à huit termes juridiques dans Word.",
        "it": "Selezionate fino a otto termini giuridici in Word.",
        "en": "Select up to eight legal terms in Word."
    },
    "wordSelectionFailed": {
        "de": "Die Auswahl konnte nicht gelesen werden. Bitte Rechtsbegriffe eingeben.",
        "fr": "La sélection n’a pas pu être lue. Saisissez les termes juridiques.",
        "it": "Non è stato possibile leggere la selezione. Inserite i termini giuridici.",
        "en": "Unable to read the selection. Enter the legal terms instead."
    },
    "readingSelection": {
        "de": "Auswahl wird gelesen…",
        "fr": "Lecture de la sélection…",
        "it": "Lettura della selezione…",
        "en": "Reading selection…"
    },
    "readWord": {
        "de": "Auswahl aus Word übernehmen",
        "fr": "Reprendre la sélection de Word",
        "it": "Usa la selezione di Word",
        "en": "Use Word selection"
    },
    "publicRunning": {
        "de": "Anfrage an OpenCaseLaw läuft…",
        "fr": "Requête à OpenCaseLaw en cours…",
        "it": "Richiesta a OpenCaseLaw in corso…",
        "en": "Request to OpenCaseLaw in progress…"
    },
    "publicResults": {
        "de": "Öffentliche Suchergebnisse",
        "fr": "Résultats publics",
        "it": "Risultati pubblici",
        "en": "Public search results"
    },
    "searchScope": {
        "de": "Zum Suchumfang",
        "fr": "Portée de la recherche",
        "it": "Ambito della ricerca",
        "en": "Search scope"
    },
    "noDecisions": {
        "de": "Die Suche hat keine Entscheide zurückgegeben. Versuchen Sie weniger oder andere Begriffe.",
        "fr": "La recherche n’a renvoyé aucune décision. Essayez moins de termes ou d’autres termes.",
        "it": "La ricerca non ha restituito decisioni. Provate meno termini o termini diversi.",
        "en": "No decisions returned. Try fewer or different terms."
    },
    "degraded": {
        "de": "OpenCaseLaw hat eine eingeschränkte Rangfolge geliefert. Bitte die Suche später wiederholen oder präzisere Begriffe verwenden.",
        "fr": "OpenCaseLaw a fourni un classement limité. Réessayez plus tard ou utilisez des termes plus précis.",
        "it": "OpenCaseLaw ha fornito un ordinamento limitato. Riprovate più tardi o usate termini più precisi.",
        "en": "OpenCaseLaw returned limited ranking. Try again later or use more precise terms."
    },
    "openDecision": {
        "de": "Entscheidtext öffnen",
        "fr": "Ouvrir la décision",
        "it": "Apri la decisione",
        "en": "Open decision text"
    },
    "sourceType": {
        "de": "Quellenart",
        "fr": "Type de source",
        "it": "Tipo di fonte",
        "en": "Source type"
    },
    "selectedCount": {
        "de": "{count} von höchstens 20 Dokumenten ausgewählt",
        "fr": "{count} documents sélectionnés sur 20 au maximum",
        "it": "{count} documenti selezionati su un massimo di 20",
        "en": "{count} of up to 20 documents selected"
    },
    "removeSelected": {
        "de": "{name} aus Auswahl entfernen",
        "fr": "Retirer {name} de la sélection",
        "it": "Rimuovi {name} dalla selezione",
        "en": "Remove {name} from selection"
    },
    "page": {
        "de": "Seite {page}",
        "fr": "Page {page}",
        "it": "Pagina {page}",
        "en": "Page {page}"
    },
    "version": {
        "de": "Version {number}",
        "fr": "Version {number}",
        "it": "Versione {number}",
        "en": "Version {number}"
    },
    "versionPage": {
        "de": "Version {version} · PDF-Seite {page}",
        "fr": "Version {version} · Page PDF {page}",
        "it": "Versione {version} · Pagina PDF {page}",
        "en": "Version {version} · PDF page {page}"
    },
    "unnumbered": {
        "de": "nicht nummeriert",
        "fr": "sans numéro",
        "it": "non numerata",
        "en": "unnumbered"
    },
    "pagesCoverage": {
        "de": "{indexed} von {total} Seiten",
        "fr": "{indexed} pages sur {total}",
        "it": "{indexed} pagine su {total}",
        "en": "{indexed} of {total} pages"
    },
    "document": {
        "de": "Dokument",
        "fr": "Document",
        "it": "Documento",
        "en": "Document"
    },
    "passageCount": {
        "de": "{count} Passagen zu «{query}»",
        "fr": "{count} passages pour « {query} »",
        "it": "{count} passaggi per «{query}»",
        "en": "{count} passages for “{query}”"
    },
    "decisionCount": {
        "de": "{count} Entscheide zu «{query}»",
        "fr": "{count} décisions pour « {query} »",
        "it": "{count} decisioni per «{query}»",
        "en": "{count} decisions for “{query}”"
    },
    "sourceNote": {
        "de": "Hinweis von OpenCaseLaw: {note}",
        "fr": "Note d’OpenCaseLaw : {note}",
        "it": "Nota di OpenCaseLaw: {note}",
        "en": "OpenCaseLaw note: {note}"
    },
    "positions": {
        "de": "Erfasster Text · Zeichenposition {start}–{end} von {total}. Diese Positionen beginnen bei 0 und sind keine amtlichen Randnummern.",
        "fr": "Texte extrait · Caractères {start}–{end} sur {total}. Ces positions commencent à 0 ; ce ne sont pas des numéros de paragraphes officiels.",
        "it": "Testo estratto · Caratteri {start}–{end} su {total}. Le posizioni iniziano da 0 e non sono numeri marginali ufficiali.",
        "en": "Extracted text · Characters {start}–{end} of {total}. Positions start at 0 and are not official paragraph numbers."
    },
    "positionUnverified": {
        "de": "Zeichen {start}–{end} · Position im Original nicht geprüft",
        "fr": "Caractères {start}–{end} · Position dans l’original non vérifiée",
        "it": "Caratteri {start}–{end} · Posizione nell’originale non verificata",
        "en": "Characters {start}–{end} · Position in original not verified"
    },
    "captured": {
        "de": "Erfasst: {date}",
        "fr": "Extrait : {date}",
        "it": "Estratto: {date}",
        "en": "Captured: {date}"
    },
    "textHash": {
        "de": "Text-Hash: {hash}",
        "fr": "Empreinte du texte : {hash}",
        "it": "Hash del testo: {hash}",
        "en": "Text hash: {hash}"
    },
    "publicScope": {
        "de": "Bis zu fünf Texttreffer{candidate}, keine vollständige Recherche. Datum und Aktenzeichen stammen aus dem Datenbestand; die Originalquelle bleibt massgeblich.",
        "fr": "Jusqu’à cinq résultats textuels{candidate}, sans recherche exhaustive. La date et le numéro de dossier proviennent des données ; la source originale fait foi.",
        "it": "Fino a cinque risultati testuali{candidate}, non una ricerca completa. Data e numero di causa provengono dai dati; fa fede la fonte originale.",
        "en": "Up to five text matches{candidate}, not comprehensive research. Dates and case numbers come from the dataset; the original source remains authoritative."
    },
    "candidateScope": {
        "de": " aus einer begrenzten Auswahl von höchstens {count} passenden Datensätzen",
        "fr": " parmi une sélection limitée à {count} enregistrements correspondants",
        "it": " da una selezione limitata a {count} record corrispondenti",
        "en": " from a limited selection of up to {count} matching records"
    },
    "aiSearch": {
        "de": "KI-gestützte Suche",
        "fr": "Recherche assistée par IA",
        "it": "Ricerca assistita dall’IA",
        "en": "AI-assisted search"
    },
    "publicSearch": {
        "de": "öffentliche Suche",
        "fr": "recherche publique",
        "it": "ricerca pubblica",
        "en": "public search"
    },
    "dataset": {
        "de": "Datenstand-Kennung: {id}",
        "fr": "Identifiant des données : {id}",
        "it": "Identificativo dei dati: {id}",
        "en": "Dataset identifier: {id}"
    },
    "analysisEmpty": {
        "de": "Wählen Sie zuerst die PDF-Quellen für die Analyse aus.",
        "fr": "Sélectionnez d’abord les sources PDF à analyser.",
        "it": "Selezionate prima le fonti PDF da analizzare.",
        "en": "First select the PDF sources to analyse."
    },
    "analysisMany": {
        "de": "Für eine belegte Analyse höchstens fünf PDF-Dateien auswählen. Die Textsuche bleibt für die ganze Auswahl verfügbar.",
        "fr": "Sélectionnez cinq PDF au maximum pour l’analyse. La recherche textuelle reste disponible pour toute la sélection.",
        "it": "Selezionate al massimo cinque PDF per l’analisi. La ricerca testuale resta disponibile per l’intera selezione.",
        "en": "Select up to five PDFs for source-based analysis. Text search remains available for the full selection."
    },
    "analysisPending": {
        "de": "Mindestens eine Quelle ist noch nicht bereit oder hat keine gespeicherte Fassung. Aktualisieren Sie den Bestand, sobald die Verarbeitung abgeschlossen ist.",
        "fr": "Une source au moins n’est pas prête ou n’a pas de version enregistrée. Actualisez les documents après leur traitement.",
        "it": "Almeno una fonte non è pronta o non ha una versione salvata. Aggiornate i documenti al termine dell’elaborazione.",
        "en": "At least one source is not ready or has no saved version. Refresh the documents once processing finishes."
    },
    "analysisFormat": {
        "de": "Für eine belegte Analyse bitte ursprüngliche PDF-Dateien auswählen. Word-, Tabellen- und Präsentationsdateien bleiben für die Bibliothekssuche verfügbar.",
        "fr": "Pour l’analyse, sélectionnez les PDF originaux. Les documents Word, tableurs et présentations restent disponibles dans la recherche de la bibliothèque.",
        "it": "Per l’analisi selezionate i PDF originali. Documenti Word, fogli di calcolo e presentazioni restano disponibili per la ricerca in biblioteca.",
        "en": "Select original PDFs for source-based analysis. Word files, spreadsheets and presentations remain available for library search."
    },
    "errorUnavailable": {
        "de": "Die Suche ist vorübergehend nicht verfügbar. Bitte versuchen Sie es erneut.",
        "fr": "La recherche est momentanément indisponible. Veuillez réessayer.",
        "it": "La ricerca non è al momento disponibile. Riprovate.",
        "en": "Search is temporarily unavailable. Please try again."
    },
    "errorTimeout": {
        "de": "Die Suche hat zu lange gedauert. Bitte präzisere Begriffe verwenden oder die Sprache eingrenzen.",
        "fr": "La recherche a pris trop de temps. Précisez les termes ou limitez la langue.",
        "it": "La ricerca ha richiesto troppo tempo. Usate termini più precisi o limitate la lingua.",
        "en": "The search took too long. Use more precise terms or restrict the language."
    },
    "errorBusy": {
        "de": "Die öffentliche Suche ist gerade ausgelastet. Bitte kurz warten und erneut suchen.",
        "fr": "La recherche publique est occupée. Patientez un instant et réessayez.",
        "it": "La ricerca pubblica è occupata. Attendete un momento e riprovate.",
        "en": "Public search is busy. Wait a moment and try again."
    },
    "errorQuery": {
        "de": "Bitte ein bis acht kurze Suchbegriffe verwenden.",
        "fr": "Utilisez un à huit termes courts.",
        "it": "Usate da uno a otto termini brevi.",
        "en": "Use one to eight short search terms."
    },
    "errorSession": {
        "de": "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
        "fr": "Votre session a expiré. Reconnectez-vous.",
        "it": "La sessione è scaduta. Accedete di nuovo.",
        "en": "Your session has expired. Sign in again."
    },
    "errorChanged": {
        "de": "Die ausgewählten Quellen wurden geändert oder werden gerade erfasst. Bitte den Bestand aktualisieren und erneut suchen.",
        "fr": "Les sources ont changé ou sont en cours de traitement. Actualisez les documents et relancez la recherche.",
        "it": "Le fonti sono cambiate o sono in elaborazione. Aggiornate i documenti e ripetete la ricerca.",
        "en": "The sources changed or are being processed. Refresh the documents and search again."
    },
    "errorSource": {
        "de": "Diese Quelle ist für Ihr Konto nicht verfügbar. Aktualisieren Sie die Auswahl.",
        "fr": "Cette source n’est pas disponible pour votre compte. Actualisez la sélection.",
        "it": "Questa fonte non è disponibile per il vostro account. Aggiornate la selezione.",
        "en": "This source is not available to your account. Refresh the selection."
    },
    "errorCapacity": {
        "de": "Die Suche ist gerade ausgelastet. Bitte versuchen Sie es später erneut.",
        "fr": "La recherche est occupée. Réessayez plus tard.",
        "it": "La ricerca è occupata. Riprovate più tardi.",
        "en": "Search is busy. Try again later."
    },
    "errorInput": {
        "de": "Bitte prüfen Sie Suchtext und Dokumentauswahl.",
        "fr": "Vérifiez le texte et les documents sélectionnés.",
        "it": "Controllate il testo e i documenti selezionati.",
        "en": "Check the search text and selected documents."
    },
    "documents": {
        "de": "Dokumente",
        "fr": "Documents",
        "it": "Documenti",
        "en": "Documents"
    },
    "templates": {
        "de": "Vorlagen",
        "fr": "Modèles",
        "it": "Modelli",
        "en": "Templates"
    },
    "presets": {
        "de": "Vorlagenkatalog",
        "fr": "Catalogue de modèles",
        "it": "Catalogo dei modelli",
        "en": "Template catalogue"
    },
    "myLibrary": {
        "de": "Meine Bibliothek",
        "fr": "Ma bibliothèque",
        "it": "La mia biblioteca",
        "en": "My library"
    },
    "filenameSearch": {
        "de": "Dateinamen suchen…",
        "fr": "Rechercher un nom de fichier…",
        "it": "Cerca per nome del file…",
        "en": "Search filenames…"
    },
    "moreActions": {
        "de": "Weitere Aktionen",
        "fr": "Autres actions",
        "it": "Altre azioni",
        "en": "More actions"
    },
    "addTemplates": {
        "de": "Vorlagen aus dem Katalog aufnehmen",
        "fr": "Ajouter des modèles du catalogue",
        "it": "Aggiungi modelli dal catalogo",
        "en": "Add catalogue templates"
    },
    "uploadLocation": {
        "de": "Uploads werden hier gespeichert. Keine Übermittlung an Anthropic.",
        "fr": "Les fichiers sont conservés ici. Aucun envoi à Anthropic.",
        "it": "I file sono conservati qui. Nessun invio ad Anthropic.",
        "en": "Uploads are stored here. Nothing is sent to Anthropic."
    },
    "createFolder": {
        "de": "Ordner erstellen",
        "fr": "Créer un dossier",
        "it": "Crea cartella",
        "en": "Create folder"
    },
    "folder": {
        "de": "Ordner",
        "fr": "Dossier",
        "it": "Cartella",
        "en": "Folder"
    },
"wordUnavailable": {"de": "Die Word-Verbindung ist nicht verfügbar. Sie können die Recherche im Browser verwenden.", "fr": "La connexion à Word est indisponible. Vous pouvez utiliser la recherche dans le navigateur.", "it": "La connessione a Word non è disponibile. Potete usare la ricerca nel browser.", "en": "The Word connection is unavailable. You can use research in the browser."},
"researchDisabled": {"de": "Die Recherche ist in dieser Installation nicht freigeschaltet.", "fr": "La recherche n’est pas activée dans cette installation.", "it": "La ricerca non è abilitata in questa installazione.", "en": "Research is not enabled in this installation."},
"sourceLabel": {"de": "Quelle", "fr": "Source", "it": "Fonte", "en": "Source"},
"searchPassage": {"de": "Textstelle suchen", "fr": "Rechercher le passage", "it": "Cerca il passaggio", "en": "Find passage"},
"privatePinpoint": {"de": "Version {version}, PDF-Seite {page}", "fr": "Version {version}, page PDF {page}", "it": "Versione {version}, pagina PDF {page}", "en": "Version {version}, PDF page {page}"},
"privateSourceNote": {"de": "Quelle öffnen: Anmeldung erforderlich. Auszug aus dem erfassten Dokumenttext; Zitat an der Quelle prüfen.", "fr": "L’ouverture de la source nécessite une connexion. Extrait du texte enregistré ; vérifier la citation dans la source.", "it": "L’apertura della fonte richiede l’accesso. Estratto del testo acquisito; verificare la citazione nella fonte.", "en": "Sign-in required to open the source. Excerpt from captured document text; check the quotation against the source."},
"privateSourceLink": {"de": "Quelle öffnen (Anmeldung erforderlich): {url}", "fr": "Ouvrir la source (connexion requise) : {url}", "it": "Apri la fonte (accesso richiesto): {url}", "en": "Open source (sign-in required): {url}"},
"copyEstimatedDate": {"de": "Datum geschätzt", "fr": "date estimée", "it": "data stimata", "en": "estimated date"},
"publicPinpoint": {"de": "Zeichen {start}–{end} von {total} im erfassten Text; keine amtlichen Randnummern", "fr": "Caractères {start}–{end} sur {total} dans le texte enregistré ; pas de numéros marginaux officiels", "it": "Caratteri {start}–{end} su {total} nel testo acquisito; non sono numeri marginali ufficiali", "en": "Characters {start}–{end} of {total} in captured text; not official paragraph numbers"},
"publicSourceNote": {"de": "Position im Original nicht geprüft; Wortlaut und Kontext an der Originalquelle prüfen.", "fr": "Position dans l’original non vérifiée ; vérifier le texte et le contexte dans la source originale.", "it": "Posizione nell’originale non verificata; verificare testo e contesto nella fonte originale.", "en": "Position in the original not checked; verify wording and context in the original source."},
"publicSourceNotePrefix": {"de": "Hinweis von OpenCaseLaw: {note}", "fr": "Note d’OpenCaseLaw : {note}", "it": "Nota di OpenCaseLaw: {note}", "en": "Note from OpenCaseLaw: {note}"},
"selectedPinpoint": {"de": "Ausgewählte Textstelle: Zeichen {start}–{end} von {total}; keine amtlichen Randnummern.", "fr": "Passage sélectionné : caractères {start}–{end} sur {total} ; pas de numéros marginaux officiels.", "it": "Passaggio selezionato: caratteri {start}–{end} su {total}; non sono numeri marginali ufficiali.", "en": "Selected passage: characters {start}–{end} of {total}; not official paragraph numbers."},
"originalPassageLink": {"de": "Textstelle im Original suchen: {url}", "fr": "Rechercher le passage dans l’original : {url}", "it": "Cerca il passaggio nell’originale: {url}", "en": "Find passage in the original: {url}"},
} satisfies Record<string, CourtOSText>;
