# Lokale Fallarbeit in Word und Browser

**Architekturvorschlag vom 10. Oktober 2026. Noch nicht implementiert.** Der heutige CourtOS-Testserver speichert hochgeladene Dateien auf dem Server. Seine Wissensbasis ist kein Zugriff auf unveränderte Dateien im persönlichen Dateisystem. Auch das dort laufende Gemma ist ein Servermodell, kein Modell auf dem Arbeitsplatz. Der Testbetrieb ist weiterhin für öffentliche und synthetische Unterlagen vorgesehen.

## Entscheidung

CourtOS erhält einen gemeinsamen Recherchebereich für Browser und Word sowie eine kleine lokale Begleitanwendung. Nutzer wählen einen Fallordner mit Klage, Klageantwort, Beilagen und Literatur. Die Originale bleiben an ihren bisherigen Orten. CourtOS liest nur den freigegebenen Bestand und legt daneben ein nachvollziehbares Fallgedächtnis in `.courtos/` an. Eine spätere institutionelle Variante kann dieselbe Schnittstelle innerhalb der freigegebenen IT betreiben.

Der bestehende Citecheck-Kern wird wiederverwendet. Es entsteht kein zweiter Zitatparser und keine zweite Anonymisierungslogik. Word und Browser unterscheiden sich in ihren Ein- und Ausgängen: Word liefert eine bewusst gewählte Passage und kann einen geprüften Nachweis an einer kontrollierten Stelle einfügen; der Browser arbeitet mit ausdrücklich ausgewählten Dateien oder Text. Recherche, Quellenkarten, lokale Modellarbeit und die Vorschau einer externen Anfrage verwenden gemeinsame fachliche Komponenten.

## Was heute tatsächlich vorhanden ist

Der offizielle Citecheck-Stand ist `ae73c86e706f45c75f1e58561304dbea5ff4cbf9`. Der frühere Prüfsnapshot vom 9. Oktober mit `dbe541ff655eb3014e909d86497bd5af78c70ac3` bleibt ein eigener Stand. Beim Abruf am 10. Oktober entsprachen die veröffentlichten Dateien `taskpane.html`, `app.js`, `anon.js` und `anon-pane.js` dem neuen Commit bytegenau; das ist keine erneute vollständige Word-Abnahme.

| Baustein | Bestehende Fähigkeit und Grenze |
|---|---|
| Citecheck `checkDocument(paragraphs, index)` | Hostunabhängige Prüfung von Zitatbezeichnung, vorhandener Gliederung, Datum und Gericht. Sie beurteilt nicht, ob die Entscheidung die Aussage trägt. |
| Citecheck `app.js` und `word.js` | Bereits ein Kern für Word und Browser. Word liest Text, navigiert zu geprüften Fundstellen, fügt auf Wunsch Kommentare ein und öffnet eine neue anonymisierte Kopie. Browser liest DOCX oder eingefügten Text. |
| Citecheck `anon.js`, `docfile.js` | Lokale Kandidatenerkennung, Ersatz bestätigter Stellen und Kontrolle einer neuen DOCX-Kopie. Keine belegte persistente, fallübergreifende Identitätsverwaltung. |
| Mike/CourtOS Word-Adapter | Dokumentlesen, Fundstellennavigation und kontrollierte Dokumentbearbeitung sind vorhandene Anschlüsse. Der bisherige Chat liest vor dem Senden automatisch das ganze aktuelle Dokument. Diesen Ablauf nicht für eine bewusste Auswahlrecherche übernehmen. |
| Heutiges Frontier-Gateway | Vorschau eines ausdrücklich eingegebenen Textpakets, Hashbindung und einmalige Freigabe. Kein automatischer Zugriff auf Akten, Fallgedächtnis oder Zuordnungstabelle. |

Die konkreten Citecheck-Anschlüsse stehen in [check.js](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/check.js#L261), [app.js](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/app.js#L401), [word.js](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/word.js#L16) und [anon-pane.js](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/anon-pane.js#L33). Die MIT-Lizenz erlaubt Wiederverwendung unter Erhaltung ihrer Hinweise. Ein versionierter gemeinsamer Kern mit übernommenen Regressionstests ist einem unabhängigen Fork vorzuziehen.

Im CourtOS-Repository sind die nutzbaren Word-Anschlüsse [useWordDoc.ts](../../word-addin/src/taskpane/hooks/useWordDoc.ts) (`selectDocumentText`, `readDocumentMarkdown`, `applyTrackedEdits`) und die Navigation in [citations.ts](../../word-addin/src/taskpane/lib/citations.ts). Die automatische Ganzdokument-Lektüre sitzt in [useWordAssistantChat.ts](../../word-addin/src/taskpane/hooks/useWordAssistantChat.ts). Eine reine Auswahl-Lesefunktion und ein dedizierter Befehl zum Einfügen eines bibliografischen Nachweises wurden im geprüften Add-in nicht gefunden; sie sind neue Arbeit. Gemeinsame Oberflächen gehören gemäss Repository-Vertrag in `frontend/src/shared/`, mit getrennten Word- und Browseradaptern.

## Originale und Fallgedächtnis

Die Begleitanwendung bekommt lesenden Zugriff auf ausdrücklich gewählte Wurzeln und Schreibzugriff nur auf ihren eigenen Arbeitsbereich und ausdrücklich gewählte Exporte. Sie darf keine Originale umbenennen, überschreiben oder löschen. Ein Pfad aus Modelltext ist niemals eine Dateiberechtigung. Relative Pfade werden gegen die gewählte Wurzel aufgelöst; Traversal und Symlinks ausserhalb dieses Bereichs werden abgewiesen. Der Prozess indexiert keine anderen Fallordner nebenbei.

Vorgeschlagene Struktur im Fallordner:

```text
.courtos/
  case.json                  # lokale Fall-ID, Schema, zugelassene Wurzeln
  sources.jsonl              # Quellen-ID, relativer Pfad, Version, Hash, Status
  wiki/
    overview.md
    chronology.md
    parties.md
    issues.md
    research.md
    status.md
  derivatives/               # Extraktion/OCR, jeweils mit Herkunft und Version
  private/                   # Identitätszuordnungen, nur im lokalen Schutzbereich
  index/                     # erneuerbarer Suchindex
  revisions/                 # unveränderliche Generationen und Änderungsprotokoll
  exports/                   # ausdrücklich erzeugte, separat geprüfte Ableitungen
```

Das lesbare Wiki ist Arbeitsmaterial. Eine Aussage nennt ihre Quelle und Fundstelle, ihren Verfasser beziehungsweise erzeugenden Lauf sowie ihren Zustand: behauptet, bestritten, geprüft oder überholt. Eine Klagebehauptung wird durch Übernahme ins Gedächtnis nicht zur feststehenden Tatsache. Die Klageantwort bleibt daneben sichtbar, auch wenn sie später eingelesen wird. Rechtliche Einschätzung, tatsächliche Behauptung und unmittelbare Quellenwiedergabe werden getrennt gespeichert.

Eine Quellenreferenz besteht aus stabiler Quellen-ID, Dateiversion mit SHA-256 und einer passenden Stelle. Bei PDF sind dies Seite, Textspanne und gegebenenfalls OCR-Koordinaten; bei DOCX Absatz-/Teilkennung und genaue Textstelle. Eine gerenderte Word-Seite ist kein dauerhaft stabiler Textanker. OCR ist eine Ableitung mit Extraktionsversion und Qualitätsstatus, keine neue Originalquelle. Vor einem Beleg wird die zugrunde liegende Originalseite geöffnet.

Eine geänderte Datei erhält eine neue Version. Abhängige Aussagen werden als überprüfungsbedürftig markiert; CourtOS ersetzt weder deren Inhalt noch entgegenstehende Befunde automatisch. Eine entfernte Quelle macht ihre Nachweise nicht mehr aktuell verfügbar. Frühere Generationen bleiben als dokumentierter Stand erhalten, soweit die lokale Aufbewahrungspolitik dies vorsieht.

Änderungen am Wiki entstehen als überprüfbare Patches gegen eine bestimmte Ausgangsgeneration. Die Begleitanwendung prüft Ausgangshashes, schreibt atomar, protokolliert die Änderung und ermöglicht Rückkehr zum vorherigen Stand. Parallele Word- und Browseränderungen dürfen sich nicht still überschreiben. Menschliche Bearbeitungen bleiben erhalten. Ungespeicherter Word-Inhalt ist zunächst ein ausdrücklich gekennzeichneter Entwurfsstand und darf nicht als identisch mit der Datei auf der Platte gelten.

## Einheitliche Zuordnung im ganzen Dossier

Ein Fall benötigt eine dauerhafte Identitätszuordnung, unabhängig von Dokumentreihenfolge und momentaner Prozessrolle. Eine stabile Entitäts-ID kann in der Klage als Klägerin und in einem Rechtsmittel als Beschwerdegegnerin erscheinen. Der Alias bleibt derselbe; die Rolle ist eine belegte Beziehung, nicht der Identitätsschlüssel. Gleiche Nachnamen, Initialen, Gesellschaften und Vertretungsverhältnisse dürfen nicht automatisch zusammenfallen. Zweifelhafte Zusammenführungen brauchen eine menschliche Entscheidung mit den betroffenen Fundstellen.

Der jetzige Citecheck-Zustand genügt hierfür nicht: `state.decide` ist eine Map im Speicher; beim Laden einer anderen Browserdatei wird sie geleert. Die vorhandene Personenaggregation und die stellenbezogenen Ersetzungen können übernommen werden. Neu nötig sind Fall-ID und Eigentümerbindung, dauerhafte Entitäts-IDs, Aliase, Konfliktentscheidungen, versionierte Vorkommen und eine nachvollziehbare Ersetzungstabelle. Diese Tabelle bleibt ausschliesslich im lokalen beziehungsweise ausdrücklich zugelassenen institutionellen Schutzbereich. Sie gehört weder zum Frontier-Paket noch zu einem automatischen Rückübersetzungsschritt. [Aktueller Dateiwechsel](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/anon-pane.js#L742)

Die lokale Speicherung braucht Betriebssystemzugriffsschutz und eine passende Datenträger- und Sicherungspolitik. Ein Ordner, den OneDrive oder ein anderer Dienst synchronisiert, wird durch den Namen `.courtos` nicht rein lokal. Speicherort und bestehende Synchronisation sind bei der Einrichtung sichtbar zu machen. Die Fallzuordnung darf nicht als globales Personenregister über sämtliche Fälle wachsen.

## Freigabe für ein externes Modell

Die erste umsetzbare Stufe überträgt ausschliesslich ausgewählte, bearbeitete Textpassagen mit neutralen Quellen-IDs. Rohdateien, OCR-Zwischenstände, Bilder, verborgene DOCX-Bestandteile, Originaldateinamen, lokale Pfade, Gesprächsverläufe, Identitätstabelle und Fallwiki werden nicht automatisch angehängt. Das gilt auch für Suchanfragen an öffentliche Rechercheangebote. Eine aus einer Akte abgeleitete Frage ist nicht schon deshalb öffentlich, weil sie an eine öffentliche Datenbank geht.

Vor der Freigabe sieht der Nutzer den genauen Text, die Aufgabe, das Zielmodell und die Kostenobergrenze. Ein unveränderliches Paket bindet diese Auswahl an Quellenstände und die verwendete Zuordnungsversion; private Herkunftsdetails bleiben lokal. Die Antwort wird als externer Vorschlag mit Paketbezug zurückgeführt. Ihre Aufnahme in das Fallgedächtnis und eine Einfügung in Word bleiben getrennte, überprüfbare Schritte.

Citecheck ist dabei ein Hilfsmittel, kein Beweis der Nichtidentifizierbarkeit. Einzelne unbekannte kleingeschriebene Wörter werden gegenwärtig nur gezählt, nicht einzeln angezeigt. Bilder und eingebettete Dateien werden gezählt, ihr Inhalt aber nicht untersucht; die DOCX-Erzeugung übernimmt nicht entfernte Binärteile. Seltene Sachverhaltskombinationen können trotz ersetzter Namen identifizierend bleiben. Die bestehende Entitätserkennung ist zudem auf veröffentlichte Entscheidungen ausgerichtet; ihre Behandlung von Amts-, Kanzlei- und Unternehmensangaben muss für unveröffentlichte Parteischriften neu bewertet werden. [Kleinschreibung](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/anon.js#L507), [Dateibestandteile](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/docfile.js#L360), [Kopierpfad](https://github.com/jonashertner/citecheck/blob/ae73c86e706f45c75f1e58561304dbea5ff4cbf9/addin/js/docfile.js#L499)

Eine automatische Freigabe nach einem vermeintlich grünen Anonymisierungsresultat ist daher nicht vorgesehen. Spätere PDF-/Bildausgaben brauchen zusätzlich Prüfung von Pixeln, Textlayern, Anhängen und Metadaten. Ein schwarzes Rechteck über Text ist keine ausreichende Entfernung des Textes.

## Word, Browser und lokaler Anschluss

Die gemeinsame Oberfläche sollte Eingaben über einen kleinen Hostvertrag erhalten: `readSelection`, `openSource`, `previewInsertion`, `insertConfirmedText` und Fallzugriff über die Begleitanwendung. Keiner dieser Aufrufe läuft allein durch Öffnen des Recherchebereichs. In Word wird vor einer Einfügung geprüft, ob der ausgewählte Bereich noch zum bestätigten Stand passt. Im Browser ersetzen Textauswahl, Kopieren und expliziter Export die Word-Schreiboperationen.

Browser können nicht überall dauerhaft auf normale Ordner zugreifen. `showDirectoryPicker` benötigt einen sicheren Kontext und eine unmittelbare Nutzeraktion; die Unterstützung ist begrenzt. Chromiums File System Access erlaubt gewählte Dateien und Ordner, erfordert aber Berechtigungsprüfung und gegebenenfalls erneute Freigabe. Das ist eine optionale Browservariante, keine plattformübergreifende Grundlage für Fallgedächtnis oder Word. Die Begleitanwendung stellt den stabilen Zugang bereit. [Chrome-Dokumentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [Mozilla-API-Referenz](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

Der lokale Anschluss selbst ist noch zu bauen und pro Zielplattform zu prüfen. Eine Loopback-Adresse allein authentifiziert keinen Aufrufer. Erforderlich sind explizite Kopplung an Client und Nutzer, kurzlebige eng begrenzte Berechtigungen, exakte Origin-/Host-Prüfung, Schutz gegen fremde Webseiten und DNS-Rebinding sowie keine allgemeinen Datei- oder Shell-Endpunkte. Wo Browser/WebViews den direkten Anschluss einschränken, ist eine verwaltete Desktop-/Institutionenbrücke nötig; keine pauschale Aufweichung von CORS oder Browser-Schutzmassnahmen.

Die aktuelle Word-Anmeldung darf ebenfalls nicht vorausgesetzt werden. Microsoft beschreibt für Add-ins getrennte Dialog- und Taskpane-Laufzeiten, getrennten Sitzungsspeicher und Einschränkungen bei Anmeldungen im Iframe. Eine bestätigte Anmeldung im normalen Browser beweist keine Anmeldung im Word-Taskpane. Der neue Client braucht einen Office-tauglichen, einmaligen Sitzungsaustausch und Tests in Word unter Windows, macOS und im Web. [Microsoft: Authentifizierung mit der Dialog-API](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/auth-with-office-dialog-api)

Konkret verwendet das bisherige Add-in [auth/session.ts](../../word-addin/src/taskpane/auth/session.ts) mit Cookie-Sitzung und `/auth/handoff`. Die gegenwärtige [CourtOS-Zugangsschranke](../../backend/src/middleware/courtosAccess.ts) lässt von den Auth-Routen nur `/auth/cloudflare`, `/auth/session` und `/auth/logout` passieren. Ein funktionierender Word-Login über die aktuelle Cloudflare-Konfiguration ist daher nicht vorhanden beziehungsweise nicht abgenommen; die Schranke darf für die Integration nicht pauschal geöffnet werden.

Citechecks eigenständiger lokaler Prüfmodus behält seine eigene Datenflussgrenze. Wird derselbe Bildschirm um Netzwerkfunktionen ergänzt, darf die bestehende pauschale Aussage, dass der gesamte Entwurf das Gerät nie verlässt, nicht ungeprüft für die ganze Suite übernommen werden. Gemeinsame fachliche Module sind sinnvoll; Dokumentdaten sollten nicht automatisch im gemeinsamen Zustand aller Netzwerkfunktionen liegen.

## Kleinster belastbarer Ausbau

1. Gemeinsamer Recherchebereich mit bewusster Texteingabe beziehungsweise Word-Auswahl, öffentlichen Quellen und dem bestehenden geprüften Frontier-Paket. Noch kein automatisches Aktenlesen.
2. Lokale Begleitanwendung für einen gewählten Fallordner: Quellenregister, lokale Extraktion, begrenzte Passage-Suche und lesbares Wiki. Originalschreibversuche, fremde Pfade und fallfremde Suche müssen negativ getestet sein.
3. Dokumentübergreifende Zuordnung mit mindestens zwei gleichnamigen Personen, wechselnden Rollen, drei zusammengehörenden Dokumenten und späteren Korrekturen als synthetische Abnahmefälle.
4. Geprüfte Textableitungen an das Frontier-Gateway; Rückführung mit Quellenprüfung. Ein Test muss beweisen, dass Dateien, Zuordnungstabelle, Wiki, Originalpfade und nicht ausgewählte Passagen nicht im Paket stehen.
5. Erst nach gesonderter Betriebs- und Schutzprüfung reale Fallakten. Die heutige öffentliche VPS-Sandbox erhält durch dieses Dokument keine entsprechende Freigabe.

Der erste produktive Nutzen wäre damit konkret: Eine Frage über mehrere eigene Unterlagen stellen, die Antwort an Originalstellen prüfen, den Arbeitsstand lesbar behalten und bei Bedarf genau ausgewählte Textstellen einem stärkeren Modell vorlegen. Die Originalablage und die Entscheidung darüber, was nach aussen geht, bleiben beim Nutzer.
