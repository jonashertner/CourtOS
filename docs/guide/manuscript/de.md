# Das Gericht im Zeitalter der KI
Arbeitsbuch | 10. Oktober 2026

## 1. Das Gericht im Zeitalter der KI
Ein kurzer Leitfaden für Richterinnen, Richter und Gerichtsschreibende. Mit CourtOS recherchieren, Eingaben prüfen und Belege weiterverwenden.

## 2. Bei der Aufgabe beginnen
Was soll bei der gerichtlichen Arbeit besser werden?

### Eine konkrete Frage
Nicht jede Arbeit braucht KI. Beginnen Sie mit einer Schwierigkeit: Wo steht die entscheidende Behauptung? Welche Beilage trägt sie? Was bringt die Gegenpartei vor? Welche Rechtsfrage ist offen? Ein gutes Werkzeug spart Sucharbeit und macht diese Fragen leichter prüfbar.

### Den Ablauf überdenken
Richard Susskind fragt nach dem Zugang zum Recht und unterscheidet schnellere bestehende Abläufe von einer anderen Organisation der Arbeit. James Allsop erinnert an die richterliche Gewalt, ihre menschliche Aufgabe und die Grenzen reiner Leistungsmessung. [1, 2, 3]

### Der Massstab
Für CourtOS folgt daraus ein Arbeitsprinzip: Jede erhebliche Aussage soll zu einer überprüfbaren Fundstelle führen. Unsicherheit und Widerspruch müssen sichtbar bleiben. Das ist unser Gestaltungsvorschlag, kein Nachweis besserer Rechtsprechung.

## 3. Das Urteil bleibt menschlich
Die KI liefert einen Vorschlag. Das Gericht verantwortet seine Gründe.

### Der rechtliche Rahmen
Art. 29 BV schützt faire Verfahren, rechtliches Gehör und eine angemessene Verfahrensdauer. Art. 29a gewährleistet den Zugang zu einem Gericht, vorbehaltlich gesetzlicher Ausnahmen. Art. 30 verlangt ein gesetzliches, zuständiges, unabhängiges und unparteiisches Gericht; Art. 191c bindet richterliche Behörden in ihrer Rechtsprechung allein an das Recht. [4]

### Gründe statt bloss guter Formulierungen
Die Begründung muss die tragenden Überlegungen erkennen lassen und eine sachgerechte Anfechtung ermöglichen. Eine flüssige KI-Antwort erfüllt diese Aufgabe noch nicht. [5]

### Allein oder im Spruchkörper
Für Einzelrichter und Kollegialgerichte gilt derselbe Vorschlag: Quellen prüfen, Gegenargumente festhalten und Verantwortung zuordnen. Im Dreier- oder Fünfergremium braucht jede Person Raum für eine eigene Einschätzung. Eine frühe gemeinsame Besprechung bleibt möglich. Besondere Beratungs- und Abstimmungsfunktionen sind im Pilot nicht umgesetzt.

## 4. Wohin die Daten gehen
«Lokal» bedeutet hier: auf dem CourtOS-Server in Deutschland.

### Drei getrennte Wege
- Eigene PDFs und Gemma 4: Speicherung und Modellverarbeitung auf dem Switchboard-Server bei Hetzner in Deutschland. Nicht auf Ihrem Computer.
- OpenCaseLaw: Ihre ausdrücklich gesendeten Suchbegriffe gehen an den öffentlichen Suchdienst. Er verwendet externe KI. Ihre Bibliothek und Ihr Word-Dokument werden nicht mitgeschickt.
- Claude Opus 5.5: Die Frontier-Prüfung sendet den von Ihnen freigegebenen Text an Anthropic. Erst nach der vollständigen Vorschau und Ihrer Freigabe.

### Die Verbindung
Cloudflare vermittelt Anmeldung und Webverkehr und verarbeitet dabei auch angezeigte Inhalte. Grün kennzeichnet Gemma, Violett die externe Prüfung. Die Beschriftung nennt Anbieter und Verarbeitungsweg.

### Der heutige Testbetrieb
Verwenden Sie öffentliche Entscheide, rechtmässig nutzbare nicht vertrauliche Literatur oder erfundene Testunterlagen. Keine echten Fallakten oder vertraulichen Dokumente. Eine Anmeldung ist keine institutionelle Freigabe. Automatische Anonymisierung ist nicht vorhanden.

## 5. Suchen und weiterarbeiten
Ein Beleg soll dort ankommen, wo Sie schreiben.

### Öffnen
Im Browser: https://sandbox.swisslaw.io/research. Melden Sie sich mit Ihrer E-Mail-Adresse und dem zugesandten Code an. In Word öffnen Sie das eingerichtete CourtOS-Add-in. Wählen Sie Quellen, bevor Sie eine Frage stellen.

### Öffentlich recherchieren
Wählen Sie «Rechtsprechung finden» und OpenCaseLaw. Geben Sie eine Entscheidkennung oder wenige Suchbegriffe ein. Die Suche zeigt eine begrenzte Auswahl; fehlende Treffer belegen keine fehlende Rechtsprechung. Vertrauliche Namen und Sachverhalte gehören nicht in diese Eingabe.

### Eine Stelle mitnehmen
Öffnen Sie den Entscheid und prüfen Sie das Original. Markieren Sie eine kurze Passage, übernehmen Sie die Auswahl und kopieren Sie Text samt Quelle oder fügen Sie ihn in Word ein. Der Link zur Textsuche im Original versucht, die Stelle zu finden. Er bestätigt keine amtliche Randnummer; ein Link zum ganzen Original ist keine genaue Fundstelle.

### Mehr Platz im Browser
Öffnen Sie aus Word den Browser und arbeiten Sie mit demselben Konto weiter. Übergeben Sie den Recherchestand anschliessend zurück. Bei verschiedenen Ständen wählen Sie bewusst. Die Übergabe gilt zwei Stunden; sie startet keine neue Suche und schreibt nichts selbständig in Ihr Dokument.

### Zitierangaben prüfen
«Zitate» öffnet Citecheck separat. CourtOS übergibt dabei keinen Text. Ob ein angeführter Entscheid Ihre Aussage trägt, prüfen Sie im Original.

## 6. Eigene Quellen hinzunehmen
Wählen Sie Originalquellen. Stellen Sie Fragen. Prüfen Sie die Fundstellen.

### Nach Geschäftsnummer ablegen
Legen Sie in der Bibliothek einen Ordner mit der Geschäftsnummer an. Darunter folgen Parteien, Eingaben und Beilagen; gemeinsame Akten liegen separat. Laden Sie PDFs im passenden Ordner hoch. CourtOS speichert Kopien auf dem Server.

### Die Quellen wählen
Über «Eigene Quellen wählen» bestimmen Sie die PDFs für das Gespräch. Für Rechtsprechung öffnen Sie einen OpenCaseLaw-Entscheid, wählen einen kurzen Auszug und übernehmen ihn ins Gespräch. Die reine Suche im eigenen Bestand verwendet keine KI.

### Fragen und nachfragen
Fragen Sie etwa, welche Beträge eine Eingabe nennt oder worin sich zwei Darstellungen widersprechen. Gemma arbeitet mit den gewählten Quellen. Folgefragen nutzen dieselben Fassungen; für andere Quellen beginnen Sie ein neues Gespräch. Ohne Quellen ist keine Anfrage möglich.

### Die Antwort nachprüfen
Jeder Antwortabsatz braucht einen geprüften Quellenverweis. Öffnen Sie die Fundstelle und lesen Sie den Zusammenhang. Bei fehlendem Nachweis wird die Antwort zurückgehalten. Links auf eigene PDFs bleiben auf berechtigte Konten beschränkt.

### Wortlaut ist kein Richtigkeitsbeweis
Die Prüfung bestätigt Fundstelle und Zitat, nicht die Schlussfolgerung. Eine Parteibehauptung bleibt eine Behauptung. Eine PDF-Seite kann von der gedruckten Seitenzahl abweichen.

## 7. Eingaben prüfen
Aus Behauptungen und Belegen wird eine überschaubare Prüfliste.

### Vorbereiten
Öffnen Sie «Eingaben prüfen». Fügen Sie über die Bibliothek kurze Testklagen, Antworten und Beilagen hinzu. Wählen Sie Fassungen, Dokumentrollen, Parteien und Berichtssprache. Unter «Beispieldossiers» finden Sie vier Übungsfälle auf Deutsch, Französisch, Italienisch und Englisch. «Vier PDFs übernehmen» legt das gewählte Dossier unter einem fiktiven Aktenzeichen ab, geordnet nach Parteien und gemeinsamen Belegauszügen. Die Unterlagen sind aus veröffentlichten Urteilen rekonstruiert, keine Originaleingaben. Prüfen Sie danach Rollen und Parteien.

### Drei Aufträge
- Tatsachen und Belege: Behauptung, Beleg und Gegenposition stehen nebeneinander. Die KI schlägt «Stützt die Aussage», «Widerspricht der Aussage», «Bleibt offen» oder «Im ausgewählten Bestand nicht gefunden» vor.
- Rechtliche Aussagen: Verglichen wird nur mit den ausgewählten Quellen. Nicht beigefügte Entscheide und Literatur werden nicht automatisch beschafft. Recherchieren Sie öffentliche Fundstellen gesondert.
- Chronologie: Eindeutige Tagesdaten werden geordnet. Ungefähre oder fehlende Daten bleiben getrennt. Gegensätzliche Darstellungen bleiben eigene Einträge.

### Das Ergebnis lesen
Wählen Sie «Teilanalyse starten». Ein Bericht enthält höchstens zwölf Zeilen und nennt die gelesenen Quellen, Fassungen und Seiten. Öffnen Sie die Belege. Die Wortlautprüfung bestätigt eine Textstelle, nicht die KI-Beurteilung oder die Wahrheit einer Parteibehauptung.

### Teilanalyse im Test
Die KI kann trotz vollständiger Textübernahme Aussagen übersehen. Zu grosse Auswahlen oder Entwürfe mit unbestätigten Fundstellen werden nicht freigegeben. Prüfen Sie Vollständigkeit und Begründung selbst; die Zuverlässigkeit dieses Ablaufs wird noch erprobt.

## 8. KI gezielt beiziehen
Wählen Sie einen Auftrag und die dafür nötigen Quellen.

### Gemma auf dem CourtOS-Server
Im Browser: Der Assistent kann mit einer ausgewählten PDF-Gruppe einen Entwurf vorbereiten. Senden startet die Analyse. Das Modell verwendet eine Unsloth-Fassung und läuft auf Serverprozessoren; Wartezeiten sind möglich. Gemma ist keine Garantie für richtige Antworten. Die Nutzungsgrenzen stehen in der Anwendung.

### Eine externe Prüfung
Im Browser: Übergeben Sie einen kurzen, extern zulässigen Ausschnitt an die Frontier-Prüfung. Bearbeiten Sie Auftrag und Text. Kontrollieren Sie die gesamte Vorschau, den Anbieter und das Modell. Anhänge und übriger Chatverlauf gehören nicht automatisch dazu. Links werden nicht als Quelleninhalt nachgeladen.

### Mit dem Ergebnis umgehen
Eine externe Antwort kann als bearbeitbarer Entwurf zurückkehren. Sie wird nicht automatisch erneut gesendet. Prüfen Sie auch hier jede tragende Aussage am Original. Eine gut klingende Antwort eines zweiten Modells ist keine unabhängige Quellenprüfung.

## 9. Erst erproben, dann einführen
Ein brauchbarer Pilot liefert Beobachtungen statt Versprechen.

### Den Nutzen prüfen
Nehmen Sie einen kleinen Testfall mit bekannten Behauptungen, Belegen und Widersprüchen. Zählen Sie übersehene und erfundene Aussagen. Prüfen Sie Parteien, Beträge, Daten und Fundstellen. Messen Sie auch Warte- und Korrekturzeit. Vergleichen Sie mit Ihrem bisherigen Vorgehen.

### Vor echten Akten
Die Institution muss erlaubte Aufgaben, Anbieterzugriffe, Berechtigungen, Aufbewahrung, Löschung, Betrieb und fachliche Verantwortung klären. Word für macOS wurde mit einem synthetischen Dokument erprobt; andere Versionen und institutionelle Umgebungen brauchen eigene Tests.

### Was noch fehlt
Die direkte Arbeit im lokalen Aktenordner und eine über mehrere Dokumente konsistente Pseudonymisierung sind Zukunftsaufgaben. Ersatznamen allein machen Unterlagen nicht anonym. Ein erfolgreicher Pilot ersetzt weder diese Entwicklung noch die rechtliche und technische Freigabe.

### Offene Software
- [CourtOS · Quellcode und GNU AGPL v3.0](https://github.com/jonashertner/CourtOS)

## 10. Quellen und Reichweite
Grundlagen der gekennzeichneten Positionen und Rechtsaussagen; geprüft am 9. Oktober 2026.

- [1. Richard Susskind · Online Courts and the Future of Justice](https://academic.oup.com/oxford-law-pro/book/41081)

Verlagszusammenfassung und Inhaltsverzeichnis, Teil II. Das vollständige Buch wurde nicht ausgewertet.

- [2. Richard Susskind · Corrected oral evidence: Constitutional implications of Covid-19](https://committees.parliament.uk/oralevidence/462/html/)

Amtliches Wortprotokoll des House of Lords, 3. Juni 2020, Frage 30; Kontext: Fragen 23–24 und 29.

- [3. James Allsop · Technology and the Future of the Courts](https://www.fedcourt.gov.au/__data/assets/pdf_file/0017/55520/Allsop-CJ-20190326.pdf)

Vortrag vom 26. März 2019, S. 2–4 und 11–12, veröffentlicht vom Federal Court of Australia.

- [4. Bundesverfassung · SR 101](https://www.fedlex.admin.ch/eli/cc/1999/404/de)

Art. 29 Abs. 1–2, 29a, 30 Abs. 1 und 3 sowie 191c. Geprüfte Fassung: 3. März 2024.

- [5. Bundesgericht · BGE 129 I 232](https://www.bger.ch/ext/eurospider/live/de/php/clir/http/index.php?lang=de&type=show_document&highlight_docid=atf://129-I-232:de)

E. 3.2, S. 236–237. Verwendet wird der allgemeine Begründungsgrundsatz; der Entscheid betraf eine Einbürgerungsfrage.

### Zu dieser Ausgabe
Arbeitsabläufe und Gestaltungsregeln sind eigene Vorschläge. Sie belegen weder einen Produktivitätsgewinn noch die Zulässigkeit eines bestimmten KI-Einsatzes. Funktionsstand: 10. Oktober 2026. Quellenprüfung, Modellqualität und institutionelle Freigabe bleiben verschiedene Aufgaben.

