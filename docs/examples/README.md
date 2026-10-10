# Vier optionale Beispieldossiers

Stand: 10. Oktober 2026. Redaktion: Jonas Hertner / CourtOS.

Jeder Fall beruht auf einem veröffentlichten Urteil des Schweizerischen Bundesgerichts. Die vier PDFs sind neu formulierte, ausdrücklich gekennzeichnete Übungsunterlagen: zwei Parteistandpunkte und zwei erzählende Belegauszüge aus der Urteilsdarstellung. Es wurden keine Originaleingaben, unterschriebenen Verträge, Bankauszüge oder vollständigen E-Mail-Dateien beschafft. Die Belegauszüge sind keine Faksimiles oder wortgetreuen Originalurkunden.

## Verwendung

1. Unter «Eingaben prüfen» den geschlossenen Bereich «Beispieldossiers» öffnen, Das gewünschte fiktive Aktenzeichen unter den vier gleichzeitig sichtbaren Fällen wählen und Herkunftshinweis/Originalurteil prüfen. «Vier PDFs übernehmen» legt den festen persönlichen Aktenordner an, lädt fehlende PDFs über den normalen Uploadweg hoch und setzt Rollen sowie Entwurfssprache. Bereits vorhandene, eindeutig durch Dateiname und Hash erkannte Übungsfassungen werden ohne Inhaltsersetzung wiederverwendet und in die Zielordner eingeordnet. Es wird kein Konto automatisch befüllt. Einzelne PDFs lassen sich auch herunterladen und manuell hochladen.
2. Nach «Vier PDFs übernehmen» sind Auswahl, Rollen und Entwurfssprache bereits gesetzt und können geprüft werden. Nur beim manuellen Upload die vier Dateien unter «Eingaben prüfen» selbst auswählen: D01 als Eingabe, D02 als Stellungnahme, D03/D04 als Beilage. Die vorgeschlagenen Parteien stehen im Quellenregister; die Entwurfssprache passend zum Dossier wählen.
3. Tatsachenvergleich, Rechtsbehauptungen oder Chronologie ausdrücklich starten. Das Hochladen allein startet kein Modell. Die normalen Speicher- und Auftragskontingente gelten.
4. Zitate stets im bezeichneten PDF und Absatz kontrollieren. Bei Rechtsfragen zusätzlich das verlinkte Originalurteil und dessen angegebenen Abschnitt lesen. Die vier Upload-Dateien enthalten keine überprüfte rechtliche Musterlösung.

**Nicht mit hochladen:** `expected-findings.json` ist der getrennte Prüfschlüssel. Er gehört weder in die Quelldokumentauswahl noch in den Modellprompt. `sourcekey.json` dokumentiert Herkunft und redaktionelle Eingriffe.

## Ablage und Wiederverwendung

`filing.json` bindet die fiktiven Aktenzeichen `FV.2026.117`, `C.2026.204`, `OR.2026.83` und `HG.2026.42` an die vier Fälle. Das Aktenzeichen bildet direkt die oberste Ebene der persönlichen Bibliothek, ohne gemeinsamen Beispiel-Oberordner. Darunter erhält jede ausdrücklich erfundene Partei eigene Ordner für Eingaben und Beilagen in der Dossiersprache. Nicht einer Partei zugeschriebene Belegauszüge bleiben im gemeinsamen rekonstruierten Belegordner. Diese Ordnung ist redaktionell; sie behauptet keine ursprüngliche Belegurheberschaft.

Vor jeglichem Upload oder Verschieben werden alle vier Assets und der vorhandene Bibliotheksbestand geprüft. Abgeänderte, noch verarbeitete oder mehrdeutige Dateien werden nicht ersetzt oder zusätzlich hochgeladen. Frühere, unveränderte Fassungen bleiben bytegleich erhalten. Die Oberfläche weist darauf hin, dass ihre PDF-Köpfe und früheren Parteibezeichnungen nicht ersetzt werden. Bekannte alte Dateinamen und SHA-256-Werte bleiben zur Wiedererkennung im Katalog. Ein Verschieben wiederholt die aktuelle Version und die Metadatenrevision im bedingten Datenbank-UPDATE und prüft den Hash unmittelbar vorher. Dies sperrt keine gleichzeitige Byteänderung innerhalb derselben Version, verändert aber selbst keine Inhalte. Nach dem Verschieben werden Version und Hash erneut geprüft.

Ordner werden serverseitig pro Konto atomar wiederverwendet. Web Locks verhindern parallele Importe desselben Falls innerhalb eines Browsers; geräteübergreifende Upload-Transaktionen werden nicht behauptet. Bei unbestätigtem Upload gibt es keinen automatischen erneuten Import. Ein bestehender Übungsordner wird nur umbenannt, wenn sein vollständig eingesehener Unterbaum ausschliesslich bekannte Übungsdateien und zugehörige Ordner enthält. Die ursprünglichen Ordner-IDs bleiben erhalten. Alte/neue Namenskollisionen oder fremde Dateien führen zum Abbruch. Ordnerumbenennungen wiederholen Name, Elternordner und Revision im UPDATE; Datei-Metadaten werden erst nach Eigentums-, Versions- und Revisionsprüfung geändert und wiederholen Hash sowie bisherigen Namen. Dies sind einzelne bedingte Schritte, keine Gesamttransaktion; bei einem späteren Konflikt können bereits bestätigte Umbenennungen bestehen bleiben. Es werden keine fremden Dokumente verschoben und keine Dateien gelöscht.

## Fälle

### FV.2026.117 (fiktiv) · DE-01 · Indexmiete und Herabsetzungsbegehren

[Originalurteil 4A_252/2023 vom 2023-10-24](https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F24-10-2023-4A_252-2023&lang=de&type=show_document). Originalsprache: de. Fundstellen: Sachverhalt A.a–A.b, B.a–B.d; E. 2; E. 3.1–3.6; Dispositiv 1.

Vier einseitige PDFs; 4,610 UTF-8-Bytes auslesbarer Text einschliesslich Kopf-/Fusszeilen. Alle Dateien liegen deutlich unter 5 MiB.

| Datei | Rolle | Partei |
|---|---|---|
| 01 Standpunkt Bergtal Immobilien AG.pdf | claim | Bergtal Immobilien AG · Vermieterin |
| 02 Standpunkt Mara und Lukas Meier.pdf | response | Mara und Lukas Meier · Mieter |
| 03 Vertragsdaten - rekonstruierter Auszug.pdf | exhibit | keine Zuordnung |
| 04 Herabsetzungsbegehren - rekonstruierter Auszug.pdf | exhibit | keine Zuordnung |

### C.2026.204 (fiktiv) · FR-01 · Un versement pour acquérir une villa

[Originalurteil 4A_635/2016 vom 2018-01-22](https://search.bger.ch/ext/eurospider/live/fr/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F22-01-2018-4A_635-2016&lang=fr&type=show_document). Originalsprache: fr. Fundstellen: Faits A, B.a–B.c, C; Consid. 4; Consid. 5.1–5.4; Dispositif 1.

Vier einseitige PDFs; 5,259 UTF-8-Bytes auslesbarer Text einschliesslich Kopf-/Fusszeilen. Alle Dateien liegen deutlich unter 5 MiB.

| Datei | Rolle | Partei |
|---|---|---|
| 01 Position de Julien Morel.pdf | claim | Julien Morel · Demandeur |
| 02 Position de Claire Aubert.pdf | response | Claire Aubert · Successeure de Madeleine Aubert |
| 03 Acquisition et prevoyance - extrait reconstruit.pdf | exhibit | keine Zuordnung |
| 04 Convention et demandes - extrait reconstruit.pdf | exhibit | keine Zuordnung |

### OR.2026.83 (fiktiv) · IT-01 · La scadenza della prima rata

[Originalurteil 5A_121/2021 vom 2022-04-06](https://search.bger.ch/ext/eurospider/live/it/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F06-04-2022-5A_121-2021&lang=it&type=show_document). Originalsprache: it. Fundstellen: Fatti A.a–A.b; Consid. 2.1.1–2.2.2; Consid. 3.1–3.3; Dispositivo 1.

Vier einseitige PDFs; 4,584 UTF-8-Bytes auslesbarer Text einschliesslich Kopf-/Fusszeilen. Alle Dateien liegen deutlich unter 5 MiB.

| Datei | Rolle | Partei |
|---|---|---|
| 01 Posizione di Luca Bernasconi.pdf | claim | Luca Bernasconi · Creditore |
| 02 Posizione di Officine Riva SA.pdf | response | Officine Riva SA · Debitrice |
| 03 Accordo del 2019 - estratto ricostruito.pdf | exhibit | keine Zuordnung |
| 04 Rapporti e procedura - estratto ricostruito.pdf | exhibit | keine Zuordnung |

### HG.2026.42 (fiktiv) · EN-01 · Authority to sign a winter lease

[Originalurteil 4A_421/2015 vom 2016-02-11](https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F11-02-2016-4A_421-2015&lang=de&type=show_document). Originalsprache: de. Fundstellen: Facts A, B, B.a; Considerations 4–4.3.2; Operative part 1.

Vier einseitige PDFs; 4,953 UTF-8-Bytes auslesbarer Text einschliesslich Kopf-/Fusszeilen. Alle Dateien liegen deutlich unter 5 MiB.

| Datei | Rolle | Partei |
|---|---|---|
| 01 Position of Alpine Lodge GmbH.pdf | claim | Alpine Lodge GmbH · Tenant |
| 02 Position of Seeblick Immobilien AG.pdf | response | Seeblick Immobilien AG · Landlord |
| 03 Email sequence - reconstructed extract.pdf | exhibit | keine Zuordnung |
| 04 Lease and later events - reconstructed extract.pdf | exhibit | keine Zuordnung |

## Grenzen und Quellentreue

- DE/FR/IT folgen der jeweiligen Urteilssprache. EN ist eine inoffizielle englische Rekonstruktion eines deutschsprachigen Schweizer Urteils; keine offizielle englische Entscheidung. Nur zwei kurze, im Urteil bereits englisch zitierte Wendungen sind als wörtliche Zitate gekennzeichnet.
- Personen- und Firmennamen sowie Aktenzeichen sind erfunden und geben keine echten Identitäten oder amtlichen Nummernformate vor. `filing.json` und `sourcekey.json` ordnen sie den amtlich anonymisierten Rollen zu. Persönliche Geburtsdaten, Adressen und gesundheitliche Einzelheiten wurden weggelassen. Es gibt keine erfundenen Briefköpfe, Unterschriften, Bankbelege oder E-Mail-Header.
- Die Dossiers bilden bewusst einen begrenzten Streitpunkt ab. Sie ersetzen weder den vollständigen Sachverhalt noch die vollständigen Prozessakten.
- FR: Sachverhalt B.a und E. 5/5.4.2 nennen 2’222’000 FF als Transfergesamtbetrag, E. 5.4.1 einmal 2’000’000 FF. Diese Unstimmigkeit wird im Quellen-/Prüfschlüssel offengelegt. Die Übung verwendet B.a und unterscheidet den Kaufpreis von 2’000’000 FF.
- Der italienische Fall betrifft den Titel im provisorischen Rechtsöffnungsverfahren, keine endgültige Beurteilung des Bestands der Forderung.
- Amtliche Volltexte wurden am 10. Oktober 2026 vor der Redaktion geprüft. Ein späterer automatisierter HTML-Archivabruf wurde durch die Gerichtssite blockiert. Es werden keine archivierten Original-HTML-Dateien oder deren Hashes behauptet.

## Herstellung und Prüfung

`create_content.py` schreibt die redaktionelle Quelle `content.json`; `filing.json` hält die getrennte Aktenzeichen-/Parteienzuordnung und Vorfassungs-Hashes. `build.py` erstellt mit ReportLab die 16 PDFs und vier ZIPs; `pypdf` entfernt Info-/XMP-Metadaten. Verwendet werden die bereits für CourtOS lizenzierten PDF-Instanzen von Timeless Serif, Timeless Sans und Paper Mono. Keine Schriftdatei liegt im Beispielpaket.

Die Textprüfung vergleicht jeden PDF-Absatz mit `content.json`; pro Dossier gilt eine harte Grenze von 10’000 extrahierten UTF-8-Bytes. Alle 16 Seiten wurden mit Poppler gerendert und visuell geprüft. `qa/build-report.json` enthält die aktuellen Hashes und Bytezahlen; `qa/technical-verification.json` hält Schrift-Einbettung und Textgrenzen fest.

Keine Modellantworten oder Qualitätsquoten wurden mit diesen Dossiers erzeugt. Die Erwartungsmatrix dient der unabhängigen fachlichen Prüfung, nicht als Behauptung eines bereits bestandenen Modelltests.

## Reproduzierbarer Build

Voraussetzungen: Python mit ReportLab und pypdf; die gemäss `docs/guide/README.md` vorbereiteten und lizenzierten Schriftdateien in `docs/guide/.font-cache/`. Die Schriftdateien werden nicht mit den Beispielen veröffentlicht.

```sh
python3 docs/examples/create_content.py
python3 docs/examples/build.py
python3 docs/examples/publish.py
```

`publish.py` prüft die PDF-Hashes und erzeugt die 16 Dateien unter `frontend/public/examples/` sowie den festen Katalog `frontend/src/app/lib/exampleMatters.ts`. Quellenregister und unabhängiger Prüfschlüssel bleiben separate Downloads; sie sind keine Importquellen. Die Assets benutzen die vorhandene App-Auslieferung, ohne separate Cloudflare-Regel oder öffentliche Ausnahme. Generierte Zwischenstände unter `output/` und `qa/` sind ignoriert. Vor einer Freigabe alle neu gerenderten Seiten visuell prüfen.
