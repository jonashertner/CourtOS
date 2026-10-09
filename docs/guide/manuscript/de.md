# Mit CourtOS am Dossier arbeiten
Leitfaden zum Pilotbetrieb | 9. Oktober 2026

## 1. Am Dossier arbeiten
Ein kurzer Probelauf für Gerichtsschreiberinnen, Gerichtsschreiber, Richterinnen und Richter.

Aus vier Dokumenten soll ein nachvollziehbarer Arbeitsstand entstehen: Was ist belegt? Wo widersprechen sich die Akten? Welche entscheidrelevante Frage bleibt offen? CourtOS soll Sie bei dieser Arbeit unterstützen.

- Akten erschliessen
- Rechtsfrage klären
- Prüfvermerk erstellen

### Der erste Durchlauf
Öffnen Sie https://sandbox.swisslaw.io/pilot und geben Sie Ihre persönliche E-Mail-Adresse ein. Cloudflare Access sendet Ihnen einen Einmalcode. Nach dessen Bestätigung wird Ihr Konto automatisch angelegt; eine Einladung ist nicht nötig. Starten Sie den geführten Fall. Planen Sie etwa 15 Minuten ein.

### Ein überschaubarer Test
Der geführte Ablauf verwendet nur die vorbereitete erfundene Akte. Im ergänzenden offenen Arbeitsbereich dürfen ausschliesslich synthetische Testdokumente erprobt werden. Die folgenden Prüfkriterien beziehen sich auf den geführten Fall. Beispielakte und voreingestellte Antwortsprache sind derzeit Deutsch.

### Ihr Weg durch das Heft
Aktenerschliessung auf Seite 2, Rechtsfrage auf Seite 3, Prüfvermerk auf Seite 4. Seite 5 enthält drei Testaufgaben. Datenweg und Grenzen folgen auf Seite 6; spätere institutionelle Entscheidungen auf Seite 7.

## 2. Die Akte erschliessen
Lassen Sie die Chronologie erstellen. Lesen Sie danach gezielt gegen.

### Ein überschaubares Dossier
Die Baubehörde Linden und die beteiligte Person sind erfunden. Vier kurze Dokumente enthalten unterschiedliche Datumsangaben, einen Registereintrag und einen ununterzeichneten Verfügungsentwurf. Kein bestimmter Kanton ist festgelegt.

### Den lokalen Schritt starten
Öffnen Sie die bereitgestellten Dokumente und starten Sie die Chronologie. Das lokale Modell bearbeitet diese Unterlagen auf dem VPS. Es wird dabei kein externer Ersatzdienst aufgerufen.

### Achten Sie auf drei Dinge
- Lassen sich die Aussagen über Absatzkennungen im Dokument wiederfinden?
- Bleiben widersprüchliche Daten sichtbar, statt zu einem vermeintlich sicheren Datum zu verschmelzen?
- Unterscheidet die Antwort einen noch offenen Entwurf von einer tatsächlich erlassenen Verfügung?

### Eine flüssige Antwort ist noch kein guter Befund.
Ein Briefdatum, ein Versanddatum und eine Zustellung können verschieden sein, ohne sich zu widersprechen. Umgekehrt löst eine plausible Erzählung einen echten Aktenwiderspruch nicht.

### Wartezeit einplanen
Die Berechnung auf dem Server kann mehrere Minuten dauern. Lassen Sie einen laufenden Auftrag zunächst arbeiten, statt denselben Schritt mehrfach zu starten.

## 3. Eine Rechtsfrage freigeben
Erst das Paket lesen, dann über seine Übermittlung entscheiden.

### Der öffentliche Teil
Wählen Sie eine der festen allgemeinen Fragen und die vorgesehenen öffentlichen Quellen. Der derzeitige Katalog enthält die Bundesverfassung und zwei Bundesgerichtsurteile. Er ist noch keine Live-Suche in OpenCaseLaw.

### Die Vorschau ernst nehmen
Die Vorschau zeigt die Frage, Quellenauszüge, Modellanweisung und den externen Anbieter. Prüfen Sie, ob nur diese öffentlichen Inhalte enthalten sind. Das festgehaltene Paket ist die Grundlage Ihrer Freigabe; eine lokale Zusammenfassung gehört nicht hinein.

- Öffentliches Paket
- Ihre Freigabe
- Claude Sonnet 4.6

### Keine automatische Anonymisierung, kein freier Fallprompt.
Es werden feste öffentliche Texte ausgewählt. Der Ablauf verspricht nicht, beliebige Eingaben zuverlässig von Geheimnissen zu befreien. Ist eine Vorschau unverständlich oder unerwartet, geben Sie sie nicht frei.

### Was die Freigabe bewirkt
Erst Ihre ausdrückliche Freigabe löst den Anthropic-Aufruf aus. Die Freigabe gilt für dieses Paket und ist einmal verwendbar. Nach einem Fehler erfolgt keine automatische Wiederholung. Ein neuer Versuch benötigt ein neues Paket und eine neue Freigabe.

## 4. Einen prüfbaren Vermerk gewinnen
Die fachliche Beurteilung bleibt eine menschliche Aufgabe.

### Ein brauchbarer Arbeitsentwurf
Verbinden Sie nach der öffentlichen Analyse die Ergebnisse im lokalen Schritt. Erwarten Sie einen knappen Vermerk mit vier Teilen: belegter Aktenstand, Widersprüche, entscheidrelevante offene Fragen und nächste Prüfschritte. Eine abschliessende Verfügung ist nicht das Ziel.

### Quelle und Auslegung auseinanderhalten
Öffnen Sie bei einer wichtigen Aussage die angegebene Quelle. Prüfen Sie den Wortlaut und den Zusammenhang. Ein kurzer Auszug und eine redaktionelle Einordnung sind nicht dasselbe. Eine allgemeine Aussage zum rechtlichen Gehör beantwortet noch keinen konkreten kantonalen Verfahrensfall.

### Vor jeder Übernahme
- Stimmt die Fundstelle und trägt sie die Aussage?
- Passt der Verfahrenskontext, oder fehlt eine Abklärung?
- Sind Tatsachen, Widersprüche und rechtliche Einschätzung unterscheidbar?
- Ist die Antwort vollständig, oder endet sie am Ausgabelimit?

### Offene Fragen sind ein Ergebnis
Welcher Zustellbeleg fehlt? Gibt es eine unterzeichnete Endfassung? Wurden nachgereichte Unterlagen tatsächlich geprüft? Ein hilfreicher Entwurf macht solche Lücken sichtbar, statt sie mit Vermutungen zu schliessen.

## 5. Drei Aufgaben für Ihren Probelauf
Beurteilen Sie, ob der Ablauf Ihre Arbeit am Dossier erleichtert.

### 1  Einen Widerspruch nachweisen
Erstellen Sie die Chronologie und wählen Sie einen Datumskonflikt. Ein gutes Ergebnis nennt beide Angaben mit den passenden Absatzbelegen, unterscheidet Briefdatum und Zustellung und sagt, welcher Beleg zur Klärung fehlt.

### 2  Die Rechtsfrage eng halten
Wählen Sie die feste Frage zum rechtlichen Gehör. Prüfen Sie das öffentliche Paket vor der Freigabe und danach eine Aussage in der Originalquelle. Ein gutes Ergebnis benennt seine Verfahrensgrenze und behauptet keine automatische Nichtigkeit.

### 3  Einen Vermerk weiterbearbeiten
Lassen Sie Aktenstand und öffentliche Analyse lokal zusammenführen. Ein gutes Ergebnis trennt Tatsachen und Einschätzung, erhält Widersprüche und formuliert konkrete offene Prüffragen. Können Sie damit sinnvoll weiterarbeiten, ohne die ganze Akte nochmals ungeführt zu lesen?

### So wird Ihr Feedback nützlich
Nennen Sie den Arbeitsschritt, Ihre Erwartung, die beobachtete Abweichung und die Absatz- oder Quellenkennung. Ergänzen Sie die ungefähre Wartezeit. Keine echten Akten als Beispiel mitschicken.

### Wann der Test noch nicht überzeugt
Verlorene Belege, überspielte Widersprüche, unklare Übermittlungen oder ein scheinbar fertiger Text trotz Lücken sind konkrete Gründe für eine Verbesserung.

## 6. Was im Hintergrund geschieht
Diese Grenzen gelten für den heutigen Test auf dem VPS.

- Ihr Browser
- Cloudflare
- VPS in Deutschland

### «Lokal» bedeutet hier: auf dem VPS
Der Test läuft bei Hetzner in Deutschland, noch nicht im Netz Ihres Gerichts. Cloudflare verarbeitet den Webverkehr, einschliesslich der im Browser angezeigten Dokumente und Ergebnisse. Nur das ausdrücklich freigegebene öffentliche Paket geht im geführten Ablauf an Anthropic.

### Keine vertraulichen Akten
Die Zugangskontrolle macht diesen Datenweg nicht zu einem freigegebenen Behördenbetrieb. Echte vertrauliche Unterlagen bleiben ausgeschlossen. Es gibt keine automatische Anonymisierung, die solche Eingaben erlauben würde.

### Mit Wartezeit und Grenzen rechnen
Das lokale Gemma-Modell nutzt eine speichersparende Fassung von Unsloth auf Serverprozessoren (CPU). Im geprüften Versuch lieferte der freie Assistent nach rund sechseinhalb Minuten eine vollständige Antwort mit überprüfbaren Belegen im synthetischen PDF. Das ist eine einzelne Beobachtung zu einer gezielten Frage, keine allgemeine Laufzeit- oder Qualitätszusage. Unvollständige Ausgaben werden gekennzeichnet.

### Zugang, Kontingent und Aufbewahrung
Verwenden Sie Ihr eigenes Konto. Im geführten Fall gelten derzeit pro Person und UTC-Kalendertag höchstens drei lokale Aufträge und eine externe Analyse. Angenommene Aufträge zählen auch bei Fehlern; gemeinsame Tagesgrenzen können früher greifen. Lesen und Vorschau sind frei. Antworten bleiben bis zur ausdrücklich veranlassten Bereinigung gespeichert; Abmelden löscht sie nicht. Downloads bleiben auf Ihrem Gerät.

## 7. Der nächste Schritt in der Institution
Erst nach dem VPS-Test: ein eigener Auftrag für den institutionellen Betrieb.

### Betriebsform wählen
Möglich sind die vorhandene IT oder ein freigegebener, getrennt betriebener Dienst. Die Wahl hängt von Aufgaben, Daten und Zuständigkeiten ab.

### Vor echten Akten klären
- Erlaubte Aufgaben und fachliche sowie betriebliche Verantwortung bestimmen.
- Verarbeitungsorte und Zugriffsmöglichkeiten aller Anbieter offenlegen.
- Identitäten, Aktenberechtigungen, Aufbewahrung und Löschung regeln.
- Quellenaktualität, Qualitätsprüfung und nachvollziehbare Belege sichern.
- Pflege, Störungsbehebung, Kosten und späteren Wechsel vereinbaren.

### Noch kein Eignungsnachweis
Eine bestandene Demonstration ist keine Datenschutzfreigabe, Sicherheitszertifizierung oder Bestätigung digitaler Souveränität. Der heutige Pilot liefert Beobachtungen; er ersetzt diese Entscheidungen nicht.

### Offene Softwarebasis
CourtOS ist ein Fork von Mike (MikeOSS), dem Projekt von Open Legal Products und seinen Mitwirkenden. Die Softwarelizenz ist GNU AGPL v3.0; die Hinweise im Repository sind massgebend.

### Weiterlesen
- [CourtOS: Quellcode und Lizenz](https://github.com/jonashertner/CourtOS)
- [Mike: ursprüngliches Projekt](https://github.com/open-legal-products/mike)

