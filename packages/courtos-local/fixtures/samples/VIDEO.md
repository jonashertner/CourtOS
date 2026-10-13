# Demo videos: storyboard and narration

Two videos of about four minutes, one in German on `zh-vertrieb`, one in
French on `bger-permis`. Both follow the same seven scenes. The narration is
written for ElevenLabs: standard German and standard French, abbreviations and
numbers written out as they are spoken, Swiss spelling ("ss").

Every finding named in the narration was produced by a real run on 13 October
2026 (Claude Opus 5.5, "Fall erschliessen" / "Analyser le dossier"). If a later
run words a finding differently, keep the narration and show the run's wording
on screen.

## Recording setup

- One server per video, each with its own empty `HOME`, so the interface
  language and the case list start clean:
  `HOME=<empty dir> node bin/courtos-local.mjs "<case copy>" --port <port>`.
  Put a copy of the fixture folder somewhere outside the repository; the work
  folder goes to `$HOME/CourtOS/<case name>`. Set the language in
  `$HOME/.config/courtos/preferences.json` (`{"language":"de"}` or `"fr"`).
- Browser window at least 1440 pixels wide. Below about 1000 pixels the
  Protection tab scrolls sideways.
- Both servers can run at the same time on different ports; each keeps its
  own browser session.
- The full run of 13 October 2026 took about 53 minutes for the German case
  (≈ US$ 14) and about 32 minutes for the French case (≈ US$ 6.50), as
  estimated by the interface from the tokens used. Record the start live, cut,
  and record the results from the finished run.
- Review before approval (scene 3). German case, untick: Caffè, Igeho, Winter,
  Alto, Quelle, Kern, Kundenzuwachs, Streit, Sommer, Herren, Zürcher,
  Synthetisches Übungsdossier. French case, untick: Plan, Date, Sous, Chemin,
  Quelle, Surface, Permis, Montant, Part, Schallleistungspe, Climatherma.
  Leave everything else ticked.
- Closing card in both videos: the repository address, the licence (AGPL-3.0)
  and the line "Synthetische Stimme (ElevenLabs)" / "Voix synthétique
  (ElevenLabs)".

## Scenes

| # | Screen | Length |
|---|---|---|
| 1 | The case folder in Finder, then CourtOS opening it | 0:00–0:20 |
| 2 | Tab Akten / Dossier: pleadings and exhibits by role; open the scanned page | 0:20–0:50 |
| 3 | Tab Schutz / Protection: the list, then "Was das Modell liest" / "Ce que lit le modèle" side by side with the original; untick the ordinary words; approve | 0:50–1:45 |
| 4 | Tab Analyse: start the full run; the activity list with the model's progress notes and, in German, "Prüfung nicht bestanden … Das Modell korrigiert" (Grundfragen step; the French run needed no correction) | 1:45–2:15 |
| 5 | The results: each finding named below, with its source page | 2:15–3:25 |
| 6 | The legal-arguments step: case-law searches and the decisions read | 3:25–3:45 |
| 7 | Closing card | 3:45–4:05 |

## Deutsch: Handelsgericht Zürich, HG260074-O

**1.** Ein Dossier des Handelsgerichts Zürich: Klage, Klageantwort, Replik,
Duplik und neunzehn Beilagen. Ein Sprachmodell könnte es in wenigen
Minuten erschliessen. Aber die Akten enthalten Namen, Adressen und
Kontonummern. CourtOS zeigt, wie beides zusammengeht.

**2.** CourtOS läuft auf dem Rechner des Gerichts und liest den Aktenordner
dort, wo er liegt. Es ordnet Rechtsschriften und Beilagen und liest auch
gescannte Seiten, etwa eine handschriftliche Notiz zu einem
Jahresgespräch. Die Originale bleiben unverändert.

**3.** Bevor ein Modell etwas sieht, ersetzt CourtOS alles, was eine Person
erkennbar macht: Namen in jeder Schreibweise, Firmen, Adressen,
Telefonnummern, IBAN- und UID-Nummern. Links steht die Liste, rechts die Seite
so, wie das Modell sie lesen wird. Aus Michele Conti wird ein neutraler
Platzhalter.

Die Liste ist ein Vorschlag. Die Gerichtsschreiberin prüft sie. Wörter wie
«Winter» oder «Streit» können Nachnamen sein; hier sind es gewöhnliche Wörter,
und sie bleiben lesbar. Dann gibt sie die anonymisierte Fassung für ein
bestimmtes Modell frei. Ändert sich danach etwas an den Akten oder an der
Liste, erlischt die Freigabe.

**4.** «Fall erschliessen» führt fünf Arbeitsschritte nacheinander aus:
Chronologie, Behauptungen und Beweise, Positionen, Rechtsargumente und
Grundfragen. Das Modell liest nur die anonymisierte Fassung. Jedes Zitat, das
es anführt, prüft CourtOS Wort für Wort an der Quelle. Steht ein Zitat so
nicht in den Akten, geht es zurück an das Modell. Jede Anfrage wird wörtlich
gespeichert.

**5.** Das Ergebnis erscheint wieder mit den echten Namen, jedes Zitat mit
seiner Originalseite.

Die Klageantwort datiert die Verwarnung auf den fünften September
zweitausendvierundzwanzig. Das Schreiben selbst trägt den dritten September.

Die Klage stützt den Zuwachs an Kunden auf die Klagebeilage fünf. Diese
Beilage fehlt im Dossier.

Die Klage beziffert den Lagerbestand auf achtundneunzigtausend Franken. Die
Lagerliste ergibt, nachgerechnet, hunderteintausenddreihundertfünfzig Franken.

Die Umsatzübersicht, die die Beklagte selbst eingereicht hat, zeigt: Die
Klägerin übertraf ihre Ziele in den ersten beiden Vertragsjahren.

Und die gescannte, handschriftliche Notiz hält fest, was im offiziellen
Protokoll fehlt: Eine weitere Marke sei in Ordnung, solange die Zahlen
stimmten.

**6.** Für die Rechtsargumente sucht das Modell Entscheide auf OpenCaseLaw,
einer öffentlichen Sammlung schweizerischer Rechtsprechung, und zitiert nur,
was es dort gelesen hat. Die Suchanfragen enthalten keine Namen aus den Akten.

**7.** Die Entscheidung bleibt beim Gericht. CourtOS ordnet, belegt und zeigt,
wo die Akten nicht zusammenpassen. Der Quellcode ist offen. Das Gericht wählt
das Modell, auch eines, das es selbst betreibt.

Die Stimme in diesem Video ist synthetisch erzeugt.

## Français : Tribunal fédéral, 1C_412/2026

**1.** Un recours en matière de droit public devant le Tribunal fédéral. Des
voisins contestent un permis de construire pour deux villas jumelées avec des
pompes à chaleur. Vingt-trois documents, dont le dossier cantonal. Un modèle de
langage pourrait les analyser en quelques minutes. Mais le dossier contient des
noms, des adresses et des numéros de parcelles. CourtOS montre comment concilier
les deux.

**2.** CourtOS fonctionne sur l'ordinateur du tribunal et lit le dossier là où
il se trouve. Il classe les écritures et les pièces, et lit aussi les pages
scannées, comme le procès-verbal manuscrit d'une inspection locale. Les
originaux restent intacts.

**3.** Avant qu'un modèle ne voie quoi que ce soit, CourtOS remplace tout ce
qui permet d'identifier une personne : les noms sous toutes leurs formes, les
sociétés, les adresses, les numéros de téléphone et de parcelle. À gauche, la
liste ; à droite, la page telle que le modèle la lira. Georges Bettex, Marianne
Bettex et Werner Stucki deviennent trois désignations neutres et distinctes.

La liste est une proposition. Le greffier la vérifie. Des mots comme « Plan »
ou « Date » ne désignent personne ; ils restent lisibles. Puis il autorise la
version anonymisée pour un modèle déterminé. Si le dossier ou la liste change
ensuite, l'autorisation tombe.

**4.** « Analyser le dossier » enchaîne cinq étapes : chronologie, allégations
et preuves, comparaison des positions, arguments juridiques et questions
fondamentales. Le modèle ne lit que la version anonymisée. Chaque citation
qu'il avance, CourtOS la vérifie mot pour mot dans la source. Si elle ne s'y
trouve pas telle quelle, elle retourne au modèle. Chaque requête est conservée
telle qu'elle a été envoyée.

**5.** Le résultat s'affiche à nouveau avec les vrais noms, chaque citation
avec sa page originale.

Le recours situe l'enquête publique du vingt mars au dix-huit avril. L'avis
publié dans la Feuille des avis officiels indique le vingt et un mars et le
dix-neuf avril.

Les recourants affirment que le balcon dépasse d'un mètre quatre-vingts, et
renvoient à une photographie, la pièce quatre. Cette pièce ne figure pas au
dossier. Le plan de situation indique un mètre cinquante, tout comme le
courriel que Marianne Bettex avait elle-même écrit.

Le procès-verbal manuscrit de l'inspection locale, une page scannée, note
environ quatre mètres soixante entre le balcon et la limite. Le modèle relève
de lui-même que six mètres dix moins un mètre cinquante donnent exactement
quatre mètres soixante.

Le rapport acoustique est rédigé en allemand. Le modèle le lit et le cite dans
sa langue d'origine.

**6.** Pour les arguments juridiques, le modèle cherche des arrêts sur
OpenCaseLaw, une collection publique de jurisprudence suisse, et ne cite que
ce qu'il y a lu. Les recherches ne contiennent aucun nom tiré du dossier.

**7.** La décision reste celle du tribunal. CourtOS ordonne, documente et
montre où le dossier ne concorde pas. Le code source est ouvert. Le tribunal
choisit le modèle, y compris un modèle qu'il exploite lui-même.

La voix de cette vidéo est générée par synthèse.
