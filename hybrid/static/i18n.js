'use strict';
(() => {
  // Only fixed UI copy is registered. Source text, API/model payloads and user
  // input are never scanned or translated, including after a language change.
  const languages = ['de', 'fr', 'it', 'en'];
  const tags = ['de-CH', 'fr-CH', 'it-CH', 'en'];
  const rows = [
  [
    "Frontier-Prüfung",
    "Analyse externe",
    "Analisi esterna",
    "Frontier review"
  ],
  [
    "Frontier-Prüfung · CourtOS",
    "Analyse externe · CourtOS",
    "Analisi esterna · CourtOS",
    "Frontier review · CourtOS"
  ],
  [
    "Zum Inhalt",
    "Aller au contenu",
    "Vai al contenuto",
    "Skip to content"
  ],
  [
    "Arbeitsbereiche",
    "Espaces de travail",
    "Spazi di lavoro",
    "Workspaces"
  ],
  [
    "Recherche",
    "Recherche",
    "Ricerca",
    "Research"
  ],
  [
    "Bibliothek",
    "Bibliothèque",
    "Biblioteca",
    "Library"
  ],
  [
    "Arbeitsbuch",
    "Manuel",
    "Manuale",
    "Workbook (German)"
  ],
  [
    "Zum Arbeitsbuch",
    "Ouvrir le manuel",
    "Apri il manuale",
    "Open the workbook (German)"
  ],
  [
    "Sprache",
    "Langue",
    "Lingua",
    "Language"
  ],
  [
    "Mit ausgewähltem Text arbeiten",
    "Travailler sur un texte sélectionné",
    "Lavorare su un testo selezionato",
    "Work with selected text"
  ],
  [
    "Eine Rechtsfrage oder Argumentation mit Claude Opus prüfen. Sie bestimmen Text und Kosten.",
    "Examiner une question juridique ou une argumentation avec Claude Opus. Vous choisissez le texte et le montant autorisé.",
    "Esaminare una questione giuridica o un’argomentazione con Claude Opus. Scegliete il testo e il costo autorizzato.",
    "Examine a legal question or argument with Claude Opus. You choose the text and authorise the cost."
  ],
  [
    "Arbeitsbereich wird geladen …",
    "Chargement de l’espace de travail…",
    "Caricamento dello spazio di lavoro…",
    "Loading workspace…"
  ],
  [
    "Persönlicher Zugang",
    "Accès personnel",
    "Accesso personale",
    "Personal access"
  ],
  [
    "Ihre Sitzung ist abgelaufen.",
    "Votre session a expiré.",
    "La sessione è scaduta.",
    "Your session has expired."
  ],
  [
    "Mit E-Mail-Code anmelden",
    "Se connecter par code e-mail",
    "Accedi con un codice e-mail",
    "Sign in with an email code"
  ],
  [
    "Verarbeitung und Arbeitsfluss",
    "Traitement et travail",
    "Elaborazione e lavoro",
    "Processing and workflow"
  ],
  [
    "Lokal auf dem CourtOS-Server",
    "Localement sur le serveur CourtOS",
    "Localmente sul server CourtOS",
    "Locally on the CourtOS server"
  ],
  [
    "Deutschland · nicht auf Ihrem Gerät",
    "Allemagne · pas sur votre appareil",
    "Germania · non sul vostro dispositivo",
    "Germany · not on your device"
  ],
  [
    "Unterlagen erschliessen, Gedanken ordnen und mit Quellen arbeiten.",
    "Explorer les documents, organiser les idées et travailler avec les sources.",
    "Esplorare i documenti, ordinare le idee e lavorare con le fonti.",
    "Explore documents, organise ideas and work with sources."
  ],
  [
    "Zum lokalen Assistenten",
    "Ouvrir l’assistant local",
    "Apri l’assistente locale",
    "Open local assistant"
  ],
  [
    "Externes Cloud-Modell",
    "Modèle cloud externe",
    "Modello cloud esterno",
    "External cloud model"
  ],
  [
    "Anthropic · externe API",
    "Anthropic · API externe",
    "Anthropic · API esterna",
    "Anthropic · external API"
  ],
  [
    "Übermittelt werden nur der hier freigegebene Auftrag und Text. Anhänge und Chatverlauf bleiben ausserhalb dieser Anfrage.",
    "Seuls la demande et le texte approuvés ici sont transmis. Les pièces jointes et l’historique du chat sont exclus de cette requête.",
    "Vengono trasmessi solo l’incarico e il testo approvati qui. Allegati e cronologia della chat sono esclusi da questa richiesta.",
    "Only the request and text you approve here are sent. Attachments and chat history are excluded from this request."
  ],
  [
    "Weiterarbeit",
    "Poursuivre le travail",
    "Proseguire il lavoro",
    "Continue working"
  ],
  [
    "Zurück zu Ihrem Entwurf",
    "Revenir à votre brouillon",
    "Torna alla bozza",
    "Back to your draft"
  ],
  [
    "Die Antwort lässt sich in den lokalen Assistenten übernehmen und dort mit Ihren Quellen weiterbearbeiten.",
    "La réponse peut être reprise dans l’assistant local pour poursuivre le travail avec vos sources.",
    "La risposta può essere ripresa nell’assistente locale per proseguire il lavoro con le vostre fonti.",
    "You can take the response into the local assistant and continue working with your sources."
  ],
  [
    "Betrieb und Kontingent",
    "Service et quota",
    "Servizio e quota",
    "Service and allowance"
  ],
  [
    "Der Pilot läuft über Cloudflare und einen VPS in Deutschland. Keine vertraulichen Akten.",
    "Le pilote utilise Cloudflare et un VPS en Allemagne. Aucun dossier confidentiel.",
    "Il pilota utilizza Cloudflare e un VPS in Germania. Nessun fascicolo riservato.",
    "The pilot uses Cloudflare and a VPS in Germany. No confidential case files."
  ],
  [
    "Status aktualisieren",
    "Actualiser le statut",
    "Aggiorna lo stato",
    "Refresh status"
  ],
  [
    "Abmelden",
    "Se déconnecter",
    "Esci",
    "Sign out"
  ],
  [
    "Guthaben für Opus",
    "Crédit pour Opus",
    "Credito per Opus",
    "Opus credit"
  ],
  [
    "Verfügbares Guthaben",
    "Crédit disponible",
    "Credito disponibile",
    "Available credit"
  ],
  [
    "CHF 20 aufladen",
    "Ajouter CHF 20",
    "Aggiungi CHF 20",
    "Add CHF 20"
  ],
  [
    "CHF 50 aufladen",
    "Ajouter CHF 50",
    "Aggiungi CHF 50",
    "Add CHF 50"
  ],
  [
    "Tarif und Abrechnung",
    "Tarif et facturation",
    "Tariffa e fatturazione",
    "Rates and billing"
  ],
  [
    "Vor jedem Auftrag geben Sie einen Höchstbetrag frei. Abgerechnet wird der tatsächliche Verbrauch bis zu diesem Betrag.",
    "Avant chaque demande, vous autorisez un montant maximal. La consommation réelle est facturée dans cette limite.",
    "Prima di ogni richiesta autorizzate un importo massimo. Il consumo effettivo viene addebitato entro tale limite.",
    "Before each request, you authorise a maximum amount. Actual usage is charged up to that amount."
  ],
  [
    "Guthaben aktualisieren",
    "Actualiser le crédit",
    "Aggiorna il credito",
    "Refresh credit"
  ],
  [
    "1 · Auftrag",
    "1 · Demande",
    "1 · Richiesta",
    "1 · Request"
  ],
  [
    "Ihr Prüfauftrag",
    "Votre demande d’analyse",
    "La vostra richiesta di analisi",
    "Your review request"
  ],
  [
    "Aus Ihrer CourtOS-Arbeit übernommen. Der Text liegt hier als Entwurf vor; an Anthropic wurde noch nichts gesendet.",
    "Repris de votre travail dans CourtOS. Ce texte est un brouillon ; rien n’a encore été envoyé à Anthropic.",
    "Ripreso dal vostro lavoro in CourtOS. Il testo è una bozza; nulla è stato ancora inviato ad Anthropic.",
    "Transferred from your CourtOS work. The text is a draft; nothing has been sent to Anthropic yet."
  ],
  [
    "Auftrag",
    "Demande",
    "Richiesta",
    "Request"
  ],
  [
    "Fragestellung, gewünschter Blickwinkel und Form des Ergebnisses.",
    "Question, angle souhaité et forme du résultat.",
    "Domanda, prospettiva desiderata e forma del risultato.",
    "Question, desired perspective and form of the result."
  ],
  [
    "Text und Quellen",
    "Texte et sources",
    "Testo e fonti",
    "Text and sources"
  ],
  [
    "Nur der sichtbare Text wird verwendet. Links dienen als Quellenangabe und werden vom Modell nicht abgerufen.",
    "Seul le texte visible est utilisé. Les liens indiquent les sources ; le modèle ne les consulte pas.",
    "Viene usato solo il testo visibile. I link indicano le fonti; il modello non li consulta.",
    "Only the visible text is used. Links identify sources; the model does not retrieve them."
  ],
  [
    "Auftrag und Text enthalten nur öffentliche oder synthetische, nicht vertrauliche Inhalte.",
    "La demande et le texte contiennent uniquement des éléments publics ou synthétiques, non confidentiels.",
    "La richiesta e il testo contengono solo materiale pubblico o sintetico, non riservato.",
    "The request and text contain only public or synthetic, non-confidential material."
  ],
  [
    "Anfrage prüfen",
    "Vérifier la demande",
    "Verifica la richiesta",
    "Review request"
  ],
  [
    "Noch kein Modellaufruf.",
    "Aucun appel au modèle à ce stade.",
    "Nessuna chiamata al modello in questa fase.",
    "No model call yet."
  ],
  [
    "2 · Freigabe",
    "2 · Autorisation",
    "2 · Autorizzazione",
    "2 · Approval"
  ],
  [
    "Das erhält Anthropic.",
    "Ce qu’Anthropic recevra.",
    "Ciò che riceverà Anthropic.",
    "What Anthropic will receive."
  ],
  [
    "Zur Freigabe · Noch nicht an Anthropic gesendet",
    "À approuver · Pas encore envoyé à Anthropic",
    "Da approvare · Non ancora inviato ad Anthropic",
    "Awaiting approval · Not yet sent to Anthropic"
  ],
  [
    "Freigegeben · Externer Auftrag beauftragt",
    "Approuvé · Demande externe lancée",
    "Approvato · Richiesta esterna avviata",
    "Approved · External request submitted"
  ],
  [
    "Übermittlungsstatus wird geprüft",
    "Vérification du statut d’envoi",
    "Verifica dello stato di invio",
    "Checking submission status"
  ],
  [
    "Modell",
    "Modèle",
    "Modello",
    "Model"
  ],
  [
    "Umfang",
    "Volume",
    "Dimensione",
    "Size"
  ],
  [
    "Vollständige Systemanweisung und technische Anfrage",
    "Instruction système et requête technique complètes",
    "Istruzione di sistema e richiesta tecnica complete",
    "Full system instruction and technical request"
  ],
  [
    "Die gespeicherte Vorschau ist unveränderlich und zehn Minuten gültig.",
    "L’aperçu enregistré est immuable et valable dix minutes.",
    "L’anteprima salvata è immutabile e valida per dieci minuti.",
    "The saved preview is immutable and valid for ten minutes."
  ],
  [
    "Kostenfreigabe",
    "Autorisation des coûts",
    "Autorizzazione dei costi",
    "Cost approval"
  ],
  [
    "Höchstens",
    "Au maximum",
    "Al massimo",
    "At most"
  ],
  [
    "Kosten neu berechnen",
    "Recalculer le coût",
    "Ricalcola il costo",
    "Recalculate cost"
  ],
  [
    "Ihr Guthaben reicht für diesen Höchstbetrag nicht aus.",
    "Votre crédit ne couvre pas ce montant maximal.",
    "Il credito non copre questo importo massimo.",
    "Your credit does not cover this maximum amount."
  ],
  [
    "Guthaben aufladen",
    "Ajouter du crédit",
    "Aggiungi credito",
    "Add credit"
  ],
  [
    "Diesen Höchstbetrag inklusive MWST aus meinem Guthaben freigeben.",
    "Autoriser ce montant maximal, TVA comprise, sur mon crédit.",
    "Autorizzo questo importo massimo, IVA inclusa, dal mio credito.",
    "Authorise this maximum amount, including VAT, from my credit."
  ],
  [
    "An Anthropic senden",
    "Envoyer à Anthropic",
    "Invia ad Anthropic",
    "Send to Anthropic"
  ],
  [
    "Anfrage bearbeiten",
    "Modifier la demande",
    "Modifica la richiesta",
    "Edit request"
  ],
  [
    "3 · Antwort",
    "3 · Réponse",
    "3 · Risposta",
    "3 · Response"
  ],
  [
    "Externe Perspektive",
    "Perspective externe",
    "Prospettiva esterna",
    "External perspective"
  ],
  [
    "Status erneut abrufen",
    "Vérifier à nouveau le statut",
    "Verifica di nuovo lo stato",
    "Check status again"
  ],
  [
    "Das Ausgabelimit wurde erreicht. Die Antwort ist unvollständig.",
    "La limite de sortie a été atteinte. La réponse est incomplète.",
    "Il limite di uscita è stato raggiunto. La risposta è incompleta.",
    "The output limit was reached. The response is incomplete."
  ],
  [
    "Lokal weiterbearbeiten",
    "Poursuivre localement",
    "Prosegui localmente",
    "Continue locally"
  ],
  [
    "Antwort kopieren",
    "Copier la réponse",
    "Copia la risposta",
    "Copy response"
  ],
  [
    "Text herunterladen",
    "Télécharger le texte",
    "Scarica il testo",
    "Download text"
  ],
  [
    "Die Übernahme öffnet einen bearbeitbaren Entwurf im lokalen Assistenten. Sie löst keinen weiteren Modellaufruf aus.",
    "La reprise ouvre un brouillon modifiable dans l’assistant local. Elle ne déclenche aucun nouvel appel au modèle.",
    "Il trasferimento apre una bozza modificabile nell’assistente locale. Non avvia un’altra chiamata al modello.",
    "This opens an editable draft in the local assistant. It does not make another model call."
  ],
  [
    "Neue Anfrage",
    "Nouvelle demande",
    "Nuova richiesta",
    "New request"
  ],
  [
    "CourtOS · Ein Arbeitsraum für richterliche Arbeit.",
    "CourtOS · Un espace de travail pour la justice.",
    "CourtOS · Uno spazio di lavoro per la giustizia.",
    "CourtOS · A workspace for judicial work."
  ],
  [
    "Für diesen Arbeitsbereich muss JavaScript aktiviert sein.",
    "JavaScript doit être activé pour cet espace de travail.",
    "Per questo spazio di lavoro deve essere attivato JavaScript.",
    "JavaScript must be enabled for this workspace."
  ],
  [
    "Modell nicht konfiguriert",
    "Modèle non configuré",
    "Modello non configurato",
    "Model not configured"
  ],
  [
    "{amount} für laufende Aufträge reserviert.",
    "{amount} réservés pour les demandes en cours.",
    "{amount} riservati per le richieste in corso.",
    "{amount} reserved for running requests."
  ],
  [
    "Ihr Guthaben wird nach einer Zahlungsänderung geprüft. Bitte wenden Sie sich an den Support.",
    "Votre crédit est en cours de vérification après une modification du paiement. Contactez l’assistance.",
    "Il credito è in verifica dopo una modifica del pagamento. Contattate l’assistenza.",
    "Your credit is being reviewed following a payment change. Please contact support."
  ],
  [
    "Aufladen über Stripe. Keine automatische Aufladung.",
    "Ajout de crédit via Stripe. Aucun rechargement automatique.",
    "Ricarica tramite Stripe. Nessuna ricarica automatica.",
    "Add credit through Stripe. No automatic top-ups."
  ],
  [
    "Bezahlte Aufträge sind noch nicht verfügbar.",
    "Les demandes payantes ne sont pas encore disponibles.",
    "Le richieste a pagamento non sono ancora disponibili.",
    "Paid requests are not available yet."
  ],
  [
    "{input} je Million Eingabetokens · {output} je Million Ausgabetokens. Preise inklusive MWST.",
    "{input} par million de tokens d’entrée · {output} par million de tokens de sortie. TVA comprise.",
    "{input} per milione di token in ingresso · {output} per milione di token in uscita. IVA inclusa.",
    "{input} per million input tokens · {output} per million output tokens. VAT included."
  ],
  [
    "Kosten werden lokal berechnet. Noch kein Modellaufruf.",
    "Calcul local du coût. Aucun appel au modèle à ce stade.",
    "Calcolo locale del costo. Nessuna chiamata al modello in questa fase.",
    "Calculating cost locally. No model call yet."
  ],
  [
    "Inklusive MWST · gültig bis {time}.",
    "TVA comprise · valable jusqu’à {time}.",
    "IVA inclusa · valido fino alle {time}.",
    "VAT included · valid until {time}."
  ],
  [
    "Die Kostenfreigabe ist abgelaufen. Bitte neu berechnen.",
    "L’autorisation des coûts a expiré. Veuillez recalculer.",
    "L’autorizzazione dei costi è scaduta. Ricalcolate il costo.",
    "The cost approval has expired. Please recalculate."
  ],
  [
    "Die Kosten konnten nicht berechnet werden. Bitte erneut versuchen.",
    "Le coût n’a pas pu être calculé. Veuillez réessayer.",
    "Impossibile calcolare il costo. Riprovate.",
    "The cost could not be calculated. Please try again."
  ],
  [
    "Die Zahlungsseite konnte nicht geöffnet werden. Erneut versuchen; dieselbe Bestellung wird wieder aufgenommen.",
    "La page de paiement n’a pas pu être ouverte. Réessayez : la même commande sera reprise.",
    "Impossibile aprire la pagina di pagamento. Riprovate: verrà ripresa la stessa ordinazione.",
    "The payment page could not be opened. Try again; the same purchase will be resumed."
  ],
  [
    "Die Serverantwort konnte nicht gelesen werden. Bitte erneut anmelden.",
    "La réponse du serveur est illisible. Veuillez vous reconnecter.",
    "Impossibile leggere la risposta del server. Accedete nuovamente.",
    "The server response could not be read. Please sign in again."
  ],
  [
    "Die Anfrage konnte nicht ausgeführt werden.",
    "La demande n’a pas pu être exécutée.",
    "Impossibile eseguire la richiesta.",
    "The request could not be completed."
  ],
  [
    "Die Verbindung wurde unterbrochen. Ein angenommener Auftrag kann weiterlaufen; es erfolgt kein automatischer Neuversand.",
    "La connexion a été interrompue. Une demande acceptée peut continuer ; aucun renvoi automatique n’a lieu.",
    "La connessione si è interrotta. Una richiesta accettata può proseguire; non viene inviata di nuovo automaticamente.",
    "The connection was interrupted. An accepted request may still be running; it will not be resent automatically."
  ],
  [
    "Bereit für Ihre freigegebene Anfrage.",
    "Prêt pour votre demande approuvée.",
    "Pronto per la richiesta approvata.",
    "Ready for your approved request."
  ],
  [
    "Der externe Aufruf ist derzeit nicht verfügbar.",
    "L’appel externe est actuellement indisponible.",
    "La chiamata esterna non è attualmente disponibile.",
    "The external service is currently unavailable."
  ],
  [
    "Testkontingent: {user} externe Anfrage pro Person und UTC-Tag; {global} insgesamt. Lokale Assistentenaufträge haben ein eigenes Kontingent.",
    "Quota de test : {user} demande externe par personne et jour UTC ; {global} au total. Les demandes à l’assistant local ont un quota distinct.",
    "Quota di test: {user} richiesta esterna per persona e giorno UTC; {global} in totale. L’assistente locale ha una quota separata.",
    "Test allowance: {user} external request per person per UTC day; {global} overall. Local assistant requests have a separate allowance."
  ],
  [
    "Diese Vorschau gehört nicht zum aktuellen Arbeitsbereich.",
    "Cet aperçu n’appartient pas à l’espace de travail actuel.",
    "Questa anteprima non appartiene allo spazio di lavoro corrente.",
    "This preview does not belong to the current workspace."
  ],
  [
    "{size} Bytes Text · keine Anhänge",
    "{size} octets de texte · aucune pièce jointe",
    "{size} byte di testo · nessun allegato",
    "{size} bytes of text · no attachments"
  ],
  [
    "Die lokale Sitzung hat gewechselt. Öffnen Sie die Anfrage im zugehörigen Konto neu.",
    "La session locale a changé. Rouvrez la demande dans le compte correspondant.",
    "La sessione locale è cambiata. Riaprite la richiesta nell’account corrispondente.",
    "The local session has changed. Reopen the request in its associated account."
  ],
  [
    "Anfrage angenommen.",
    "Demande acceptée.",
    "Richiesta accettata.",
    "Request accepted."
  ],
  [
    "Anthropic verarbeitet Ihre Anfrage.",
    "Anthropic traite votre demande.",
    "Anthropic sta elaborando la richiesta.",
    "Anthropic is processing your request."
  ],
  [
    "Antwort eingegangen.",
    "Réponse reçue.",
    "Risposta ricevuta.",
    "Response received."
  ],
  [
    "Der externe Aufruf konnte nicht abgeschlossen werden. Es erfolgt keine automatische Wiederholung.",
    "L’appel externe n’a pas pu être terminé. Aucun nouvel essai automatique n’aura lieu.",
    "La chiamata esterna non è stata completata. Non viene ripetuta automaticamente.",
    "The external request could not be completed. It will not be retried automatically."
  ],
  [
    "Status wird geprüft.",
    "Vérification du statut.",
    "Verifica dello stato.",
    "Checking status."
  ],
  [
    "{seconds} Sekunden seit Beginn der Statusanzeige.",
    "{seconds} secondes depuis le début du suivi.",
    "{seconds} secondi dall’inizio del monitoraggio.",
    "{seconds} seconds since status tracking began."
  ],
  [
    "{charged} abgerechnet · {released} freigegeben. Inklusive MWST.",
    "{charged} facturés · {released} libérés. TVA comprise.",
    "{charged} addebitati · {released} rilasciati. IVA inclusa.",
    "{charged} charged · {released} released. VAT included."
  ],
  [
    "Der freigegebene Höchstbetrag ist reserviert.",
    "Le montant maximal autorisé est réservé.",
    "L’importo massimo autorizzato è riservato.",
    "The approved maximum amount is reserved."
  ],
  [
    "Die Abrechnung wird mit Ihrem Guthaben abgeglichen.",
    "La facturation est en cours de rapprochement avec votre crédit.",
    "La fatturazione viene riconciliata con il credito.",
    "Billing is being reconciled with your credit."
  ],
  [
    "ANTHROPIC · {model} · KI-ANTWORT",
    "ANTHROPIC · {model} · RÉPONSE IA",
    "ANTHROPIC · {model} · RISPOSTA IA",
    "ANTHROPIC · {model} · AI RESPONSE"
  ],
  [
    "Der Auftrag dauert länger als erwartet. Sie können den aktuellen Status erneut abrufen.",
    "La demande prend plus de temps que prévu. Vous pouvez vérifier à nouveau son statut.",
    "La richiesta richiede più tempo del previsto. Potete verificarne di nuovo lo stato.",
    "The request is taking longer than expected. You can check its status again."
  ],
  [
    "Der Versandstatus ist ungeklärt. Es erfolgt kein Neuversand. Bitte den Arbeitsbereich neu laden, um einen angenommenen Auftrag wieder aufzunehmen.",
    "Le statut d’envoi est incertain. Aucun renvoi n’a lieu. Rechargez l’espace de travail pour reprendre une demande acceptée.",
    "Lo stato di invio è incerto. Non viene effettuato un nuovo invio. Ricaricate lo spazio di lavoro per riprendere una richiesta accettata.",
    "The submission status is uncertain. It will not be resent. Reload the workspace to resume an accepted request."
  ],
  [
    "Bitte CourtOS mit demselben Konto öffnen. Sie können die Antwort weiterhin kopieren.",
    "Ouvrez CourtOS avec le même compte. Vous pouvez toujours copier la réponse.",
    "Aprite CourtOS con lo stesso account. Potete comunque copiare la risposta.",
    "Please open CourtOS with the same account. You can still copy the response."
  ],
  [
    "Die Antwort ist für die direkte Übergabe zu lang. Kopieren Sie den gewünschten Abschnitt.",
    "La réponse est trop longue pour un transfert direct. Copiez le passage souhaité.",
    "La risposta è troppo lunga per il trasferimento diretto. Copiate il passaggio desiderato.",
    "The response is too long for direct transfer. Copy the section you need."
  ],
  [
    "Der Entwurf konnte nicht übertragen werden.",
    "Le brouillon n’a pas pu être transféré.",
    "Impossibile trasferire la bozza.",
    "The draft could not be transferred."
  ],
  [
    "Betriebsstatus aktualisiert.",
    "Statut du service actualisé.",
    "Stato del servizio aggiornato.",
    "Service status refreshed."
  ],
  [
    "Antwort kopiert.",
    "Réponse copiée.",
    "Risposta copiata.",
    "Response copied."
  ],
  [
    "Die Zwischenablage ist nicht verfügbar. Markieren und kopieren Sie den Antworttext.",
    "Le presse-papiers est indisponible. Sélectionnez et copiez le texte de la réponse.",
    "Gli appunti non sono disponibili. Selezionate e copiate il testo della risposta.",
    "The clipboard is unavailable. Select and copy the response text."
  ],
  [
    "Die Sprache gilt nur in diesem Fenster; sie konnte nicht gespeichert werden.",
    "La langue ne s’applique que dans cette fenêtre ; elle n’a pas pu être enregistrée.",
    "La lingua vale solo in questa finestra; non è stato possibile salvarla.",
    "The language applies only in this window; it could not be saved."
  ],
  [
    "Bitte erneut anmelden.",
    "Veuillez vous reconnecter.",
    "Accedete nuovamente.",
    "Please sign in again."
  ],
  [
    "Der Zugriff wurde abgelehnt. Bitte Sitzung und Konto prüfen.",
    "Accès refusé. Vérifiez la session et le compte.",
    "Accesso negato. Verificate la sessione e l’account.",
    "Access was denied. Please check your session and account."
  ],
  [
    "Das angeforderte Ergebnis oder Paket ist nicht verfügbar.",
    "Le résultat ou le paquet demandé n’est pas disponible.",
    "Il risultato o il pacchetto richiesto non è disponibile.",
    "The requested result or packet is unavailable."
  ],
  [
    "Die Freigabe ist nicht mehr gültig. Bitte Vorschau und Kosten erneut prüfen.",
    "L’autorisation n’est plus valable. Vérifiez à nouveau l’aperçu et le coût.",
    "L’autorizzazione non è più valida. Verificate di nuovo l’anteprima e il costo.",
    "The approval is no longer valid. Please review the preview and cost again."
  ],
  [
    "Bitte Umfang und erforderliche Bestätigungen prüfen.",
    "Vérifiez la taille et les confirmations requises.",
    "Verificate la dimensione e le conferme richieste.",
    "Please check the size and required confirmations."
  ],
  [
    "Kontingent oder Kapazität erreicht. Ein neuer Modellaufruf wurde nicht gestartet. Bitte später erneut versuchen.",
    "Quota ou capacité atteints. Aucun nouvel appel au modèle n’a été lancé. Réessayez plus tard.",
    "Quota o capacità raggiunte. Non è stata avviata una nuova chiamata al modello. Riprovate più tardi.",
    "Allowance or capacity reached. No new model call was started. Please try again later."
  ],
  [
    "Der Dienst ist vorübergehend nicht verfügbar. Ein unklarer Versand wird nicht automatisch wiederholt.",
    "Le service est temporairement indisponible. Un envoi incertain n’est pas répété automatiquement.",
    "Il servizio non è temporaneamente disponibile. Un invio incerto non viene ripetuto automaticamente.",
    "The service is temporarily unavailable. An uncertain submission will not be retried automatically."
  ]
];
  const catalog = new Map(rows.map(row => [row[0], row]));
  const bindings = new Map(), staticBindings = [];
  let owner = null, explicit = null, locale = 'de';
  const valid = value => languages.includes(value);
  const key = () => owner ? 'courtos:ui-language:v1:account:' + encodeURIComponent(owner) : 'courtos:ui-language:v1:signed-out';
  const hint = () => { const hints = typeof navigator === 'object' ? navigator.languages || [navigator.language] : []; return hints.map(value => String(value || '').toLowerCase().split('-')[0]).find(valid) || 'de'; };
  function read() { try { const value = JSON.parse(localStorage.getItem(key())); return value?.version === 1 && value.ownerId === owner && valid(value.locale) ? value.locale : null; } catch { return null; } }
  function translate(source, values = {}) { const message = catalog.get(source)?.[languages.indexOf(locale)] || source; return message.replace(/\{([a-zA-Z]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match); }
  function text(element, source, values = {}) { bindings.set(element, { source, values }); element.textContent = translate(source, values); }
  // Capture only the shipped static DOM, once, before application data arrives.
  const walker = document.createTreeWalker(document.documentElement, 4);
  let node; while ((node = walker.nextNode())) { const source = node.textContent.trim(); if (catalog.has(source)) staticBindings.push({ node, source, before: node.textContent.match(/^\s*/)[0], after: node.textContent.match(/\s*$/)[0] }); }
  const attributes = [...document.querySelectorAll('[aria-label]')].map(element => ({ element, source: element.getAttribute('aria-label') })).filter(item => catalog.has(item.source));
  function render() {
    document.documentElement.lang = tags[languages.indexOf(locale)];
    const select = document.getElementById('ui-language'); if (select) select.value = locale;
    for (const {node,source,before,after} of staticBindings) if (node.isConnected) node.textContent = before + translate(source) + after;
    for (const {element,source} of attributes) element.setAttribute('aria-label',translate(source));
    for (const [element,{source,values}] of bindings) text(element,source,values);
    document.querySelectorAll('a[data-guide]').forEach(link => { link.href = '/guide/' + (locale === 'en' ? 'de' : locale) + '.html'; });
  }
  function setOwner(value) { owner = typeof value === 'string' && value ? value : null; explicit = null; locale = read() || hint(); render(); }
  function choose(value) { if (!valid(value)) return; explicit = value; locale = value; let saved = false; try { localStorage.setItem(key(),JSON.stringify({version:1,ownerId:owner,locale})); saved = true; } catch {} const status = document.getElementById('language-status'); if(status){status.hidden=saved;text(status,saved?'':'Die Sprache gilt nur in diesem Fenster; sie konnte nicht gespeichert werden.');} render(); }
  document.getElementById('ui-language').addEventListener('change',event => choose(event.target.value));
  window.addEventListener('storage',event => { if(event.key===key()||event.key===null){explicit=null;locale=read()||hint();render();} });
  window.addEventListener('focus',()=>{locale=explicit||read()||hint();render();});
  locale=read()||hint();render();
  const error = source => catalog.has(source) ? source : 'Die Anfrage konnte nicht ausgeführt werden.';
  const httpError = status => ({401:'Bitte erneut anmelden.',403:'Der Zugriff wurde abgelehnt. Bitte Sitzung und Konto prüfen.',404:'Das angeforderte Ergebnis oder Paket ist nicht verfügbar.',409:'Die Freigabe ist nicht mehr gültig. Bitte Vorschau und Kosten erneut prüfen.',413:'Bitte Umfang und erforderliche Bestätigungen prüfen.',422:'Bitte Umfang und erforderliche Bestätigungen prüfen.',429:'Kontingent oder Kapazität erreicht. Ein neuer Modellaufruf wurde nicht gestartet. Bitte später erneut versuchen.'})[status] || 'Der Dienst ist vorübergehend nicht verfügbar. Ein unklarer Versand wird nicht automatisch wiederholt.';
  window.CourtOSWorkbenchUI = Object.freeze({text,setOwner,translate,error,httpError});
})();
