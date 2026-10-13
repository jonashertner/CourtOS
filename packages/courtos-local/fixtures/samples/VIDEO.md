# Demo videos: storyboard and narration

Two videos of about seven minutes, one in German on `zh-vertrieb`, one in
French on `bger-permis`. Both have the same structure: CourtOS opens the case
folder for the first time, the case is anonymised and analysed, and then each
function is shown, moving between the browser and the Word add-in. The video
never says that a decision is being drafted; the Word document simply fills up.

The narration is written for ElevenLabs (eleven_v4; German voice Thomas,
French voice Victoria): standard German and standard French, numbers written
out as they are spoken, Swiss spelling ("ss"). Every finding the narration
names comes from a real run on 13 October 2026 (Claude Opus 5.5). If a later
run words a finding differently, change the narration to match the screen.

## Recording setup

- One server per video, each with its own empty `HOME`, so the interface
  language and the case list start clean:
  `HOME=<empty dir> node bin/courtos-local.mjs "<case copy>" --port <port>`.
  Put a copy of the fixture folder outside the repository; the work folder goes
  to `$HOME/CourtOS/<case name>`.
- Browser window 1440 pixels wide or more. From 1261 pixels the Protection tab
  shows the list and the page side by side.
- Review before approval. German case, untick: Caffè, Igeho, Winter, Alto,
  Quelle, Kern, Kundenzuwachs, Streit, Sommer, Herren, Zürcher, Synthetisches
  Übungsdossier. French case, untick: Plan, Date, Sous, Chemin, Quelle,
  Surface, Permis, Montant, Part, Schallleistungspe, Climatherma. Leave
  everything else ticked. Check the page preview for street addresses that
  are still readable before approving.
- The full run took about 53 minutes for the German case (≈ US$ 14) and about
  32 minutes for the French case (≈ US$ 6.50). Record the start live, cut, and
  record the results from the finished run.
- Word: a blank document that holds only the header (court, case number,
  parties). Open the add-in from the ribbon, pair it with the code from
  "Word verbinden" / "Connecter Word", then add the headings
  "Sachverhalt" / "Faits" and "Erwägungen" / "Droit" as the video goes.
  Record only the demo document's window.
- Notes and deadlines added while recording stay in the case; remove them
  before a retake.
- Title card at the start; closing card with the repository address, the
  licence (AGPL-3.0), and the lines saying that the case is fictitious and the
  voice synthetic.

## Scenes

| Scene | Screen |
|---|---|
| intro | The case in CourtOS, freshly opened |
| overview | The tabs, one by one; the Word connection |
| akten | Dossier: documents by role and party |
| scan | The handwritten page, read on the computer |
| schutz | Protection: the list of identifiers |
| preview | The page as the model reads it, beside the original |
| review | Unticking ordinary words |
| release | Approval for one model; the model choice |
| run | Analysing the case starts (the wait is cut) |
| chrono | The chronology; a click shows the source page |
| word_connect | Word: ribbon, add-in pane, pairing code |
| word_chrono | The chronology inserted under "Sachverhalt" / "Faits" |
| contra | Contradicting versions side by side |
| claims | Claims and evidence; the finding the narration names |
| word_claim | One claim sent from the browser to the cursor in Word, source as footnote |
| legal | Legal arguments checked against OpenCaseLaw; a click opens the passage |
| questions | The fundamental questions |
| word_questions | Questions inserted under "Erwägungen" / "Droit"; "Zitate prüfen" / "Vérifier les citations" |
| ask | A question of one's own, answered with quotations |
| word_support | A sentence written in Word, supported from the file, footnote, original in the browser |
| notes | A finding taken into the notes; a deadline under Procedure |
| audit | The requests exactly as sent, with letters and markers instead of names and addresses |
| close | The document as it now stands, then the closing card |

## Narration

### Deutsch: Handelsgericht Zürich, HG260074-O
**intro.** Ein erfundener Fall am Handelsgericht Zürich. Eine Herstellerin von Kaffeemaschinen hat ihrer Vertriebspartnerin im Tessin fristlos gekündigt. Nun verlangt die Vertriebspartnerin Schadenersatz. In den Akten liegen vier Rechtsschriften, neunzehn Beilagen und eine interne Notiz.

**overview.** CourtOS hat diesen Ordner eben zum ersten Mal geöffnet. Es läuft auf dem Rechner des Gerichts. Oben stehen die Bereiche. Akten: die Dokumente des Falls. Schutz: Namen werden ersetzt, bevor ein Sprachmodell etwas liest. Analyse: das Modell erschliesst den Fall, jede Aussage mit Beleg. Recherche: Rechtsprechung finden und Zitate prüfen. Notizen und Verfahren: was das Gericht selbst festhält. Und alles ist mit Word verbunden.

**akten.** Zuerst die Akten. CourtOS liest den Ordner dort, wo er liegt, und ordnet ihn: Rechtsschriften, Beilagen, Notiz. Es erkennt die Parteien und weist jedes Dokument einer Partei zu. Die Originale bleiben unverändert.

**scan.** Gescannte Seiten macht es lesbar, auch diese handschriftliche Notiz. Die Texterkennung läuft auf dem eigenen Rechner.

**schutz.** Dann der Schutz. CourtOS sucht alles, was eine Person erkennbar macht: Namen, Firmen, Adressen, Telefonnummern, Konten und die Verfahrensnummer. Hier sind es sechzig Angaben.

**preview.** Die Vorschau zeigt jede Seite im Original und so, wie ein Modell sie liest. Statt der Namen stehen dort neutrale Buchstaben.

**review.** Die Liste ist ein Vorschlag. Das Gericht prüft sie. «Winter» und «Streit» sind hier gewöhnliche Wörter. Also bleiben sie lesbar.

**release.** Erst jetzt wird diese Fassung für ein Modell freigegeben. Um zu zeigen, was möglich ist, verwendet diese Demo ein führendes Cloud-Modell, Claude Opus. CourtOS ist aber an kein Modell gebunden. Es arbeitet auch mit einem offenen Modell auf dem eigenen Rechner. Dann verlässt die anonymisierte Fassung den Rechner nicht.

**run.** Ein Klick, und das Modell erschliesst den Fall in fünf Schritten: Chronologie, Behauptungen und Beweise, Positionen, Rechtsargumente und Grundfragen. CourtOS prüft jedes Zitat Wort für Wort an den Akten. Stimmt ein Zitat nicht, muss das Modell nachbessern.

**chrono.** Einige Minuten später liegt die Chronologie vor. Jedes Ereignis steht mit einem wörtlichen Zitat aus den Akten. Ein Klick zeigt die Stelle im Original. Die echten Namen setzt CourtOS erst hier wieder ein, auf dem eigenen Rechner.

**word_connect.** Nun zu Word. Ein Klick im Menüband öffnet CourtOS neben dem Dokument. Ein Code aus dem Browser verbindet beide.

**word_chrono.** Unter «Sachverhalt» fügt ein Klick die Chronologie ein. Mit den echten Namen, jede Zeile mit ihrer Fundstelle.

**contra.** Wo die Parteien sich widersprechen, bleiben beide Fassungen stehen. Laut Klägerin lagen an der Messe nur Prospekte. Laut Beklagter standen dort Maschinen, mit Preisliste und Bestellformular.

**claims.** Dann Behauptungen und Beweise. Zu jeder Behauptung: die Beilagen, die Antwort der Gegenseite und eine kurze Würdigung. Hier fällt etwas auf. Die Beklagte will erst im Oktober vom Konkurrenzvertrieb erfahren haben. Ihr eigener Mitarbeiter hat den Messestand aber schon im März fotografiert. Gekündigt hat sie im Dezember.

**word_claim.** Einzelne Aussagen gehen direkt vom Browser an die Cursorposition in Word. Die Fundstelle wird zur Fussnote.

**legal.** Dann die Rechtsargumente, geprüft an veröffentlichten Entscheiden auf OpenCaseLaw. Dorthin gehen nur Suchbegriffe, keine Namen. Die Klägerin sagt, neun Wochen bis zur Kündigung seien zu lange. Das Bundesgericht nennt in der Regel zwei bis drei Arbeitstage. Ein Klick zeigt die Stelle.

**questions.** Schliesslich die Grundfragen. Zehn Fragen, die in diesem Fall zu entscheiden sind, Tatfragen wie Rechtsfragen. Zu jeder: eine Analyse und die Gegenargumente.

**word_questions.** In Word kommen die Grundfragen unter «Erwägungen», als Text mit Fussnoten. «Zitate prüfen» gleicht jeden zitierten Entscheid mit OpenCaseLaw ab.

**ask.** Eigene Fragen an die Akten gehen auch. Wann hat die Beklagte erstmals vom Vertrieb der Imola-Maschinen erfahren? Die Antwort kommt mit Belegen, wörtlich zitiert.

**word_support.** Nun ein eigener Satz. Markieren, «Markierung belegen», und CourtOS sucht die Stellen in den Akten. Gefunden: das Kündigungsschreiben vom fünfzehnten Dezember. Die Stelle wird zur Fussnote. «Im Browser zeigen» öffnet das Original.

**notes.** Was auffällt, kommt mit einem Klick in die Notizen, mit der Fundstelle. Unter «Verfahren» erfasst das Gericht Fristen und Termine, hier eine Instruktionsverhandlung. CourtOS berechnet keine Fristen und versendet nichts. Massgeblich bleibt der Kalender des Gerichts.

**audit.** Und was hat das Modell gesehen? Jede Anfrage ist gespeichert, genau so, wie sie gesendet wurde. Statt der Namen stehen dort Buchstaben, statt der Adressen Platzhalter.

**close.** So entsteht aus den Akten in kurzer Zeit ein Dokument, in dem jede Aussage zu ihrer Quelle führt. CourtOS ist Open Source: Jeder kann nachlesen, was es tut. Es läuft mit jedem Modell, auch lokal. Entscheiden muss das Gericht. Die Stimme in diesem Video ist synthetisch.


### Français : Tribunal fédéral, 1C_412/2026
**intro.** Un recours fictif devant le Tribunal fédéral. Des voisins contestent un permis de construire pour deux villas jumelées avec pompes à chaleur. Au dossier : six écritures, le dossier cantonal et le procès-verbal manuscrit d’une inspection locale.

**overview.** CourtOS vient d’ouvrir ce dossier pour la première fois. Il fonctionne sur l’ordinateur du tribunal. En haut, les rubriques. Dossier : les documents de l’affaire. Protection : les noms sont remplacés avant qu’un modèle de langage ne lise quoi que ce soit. Analyse : le modèle examine le dossier, chaque affirmation avec sa source. Recherche : trouver la jurisprudence et vérifier les citations. Notes et Procédure : ce que le tribunal consigne lui-même. Et tout est relié à Word.

**akten.** D’abord le dossier. CourtOS lit les fichiers là où ils se trouvent et les classe : écritures, pièces. Il reconnaît les parties et attribue chaque document à une partie. Les originaux ne sont pas modifiés.

**scan.** Les pages scannées deviennent lisibles, comme ce procès-verbal écrit à la main. La reconnaissance de texte se fait sur l’ordinateur même.

**schutz.** Ensuite, la protection. CourtOS repère tout ce qui permet d’identifier une personne : noms, sociétés, adresses, numéros de parcelle, téléphones et le numéro de la cause. Ici, soixante-huit données.

**preview.** L’aperçu montre chaque page en original, puis telle qu’un modèle la lit. Les noms y sont remplacés par des lettres neutres.

**review.** La liste est une proposition. Le tribunal la vérifie. « Plan » et « Date » sont ici des mots ordinaires. Ils restent donc lisibles.

**release.** C’est seulement maintenant que cette version est autorisée pour un modèle. Pour montrer ce qui est possible, cette démonstration utilise un modèle de pointe dans le cloud, Claude Opus. Mais CourtOS n’est lié à aucun modèle. Il fonctionne aussi avec un modèle ouvert, sur l’ordinateur du tribunal. La version anonymisée ne quitte alors pas l’ordinateur.

**run.** Un clic, et le modèle examine le dossier en cinq étapes : chronologie, allégations et preuves, positions, arguments juridiques et questions fondamentales. CourtOS vérifie chaque citation mot pour mot dans le dossier. Si une citation ne correspond pas, le modèle doit corriger.

**chrono.** Quelques minutes plus tard, la chronologie est prête. Chaque événement est accompagné d’une citation mot pour mot du dossier. Un clic montre le passage dans l’original. Les vrais noms ne sont rétablis qu’ici, sur l’ordinateur du tribunal.

**word_connect.** Passons à Word. Un clic dans le ruban ouvre CourtOS à côté du document. Un code affiché dans le navigateur relie les deux.

**word_chrono.** Sous « Faits », un clic insère la chronologie. Avec les vrais noms, chaque ligne avec sa source.

**contra.** Lorsque les parties se contredisent, les deux versions restent côte à côte. Selon les intimés, la recourante a elle-même estimé que le balcon dépasse d’un mètre cinquante. Selon les recourants, une photo montre un mètre quatre-vingts.

**claims.** Puis les allégations et les preuves. Pour chaque allégation : les pièces, la réponse de la partie adverse et une brève appréciation. Un point ressort. Le rapport acoustique calcule le bruit à neuf mètres et demi de la fenêtre. Mais sur le plan, les pompes à chaleur n’en sont qu’à huit mètres. Et les recourants n’ont jamais reçu ce rapport.

**word_claim.** Une affirmation passe directement du navigateur à la position du curseur dans Word. La source devient une note de bas de page.

**legal.** Puis les arguments juridiques, vérifiés dans les arrêts publiés sur OpenCaseLaw. Seuls des termes de recherche y sont envoyés, aucun nom. Les intimés invoquent une règle qui dispense de mesures coûteuses contre le bruit. Selon le Tribunal fédéral, elle ne vaut que si les valeurs de planification sont respectées. Un clic montre le passage.

**questions.** Enfin, les questions fondamentales. Onze questions que cette affaire doit trancher, de fait comme de droit. Pour chacune : une analyse et les arguments contraires.

**word_questions.** Dans Word, les questions fondamentales viennent sous « Droit », en texte avec notes de bas de page. « Vérifier les citations » contrôle chaque arrêt cité sur OpenCaseLaw.

**ask.** On peut aussi poser ses propres questions au dossier. À quelle distance de la fenêtre des recourants se trouvent les pompes à chaleur ? La réponse arrive avec ses sources, citées mot pour mot.

**word_support.** Maintenant, une phrase rédigée soi-même. La sélectionner, « Étayer la sélection », et CourtOS cherche les passages dans le dossier. Résultat : la décision de la Municipalité du dix-huit septembre. Le passage devient une note de bas de page. « Afficher dans le navigateur » ouvre l’original.

**notes.** Ce qui frappe va en un clic dans les notes, avec sa source. Sous « Procédure », le tribunal saisit les délais et les échéances, ici un délai de réplique. CourtOS ne calcule aucun délai et n’envoie rien. Le calendrier du tribunal reste déterminant.

**audit.** Et qu’a vu le modèle ? Chaque requête est conservée, exactement telle qu’elle a été envoyée. À la place des noms, des lettres ; à la place des adresses, des marqueurs.

**close.** Ainsi, à partir du dossier, un document se constitue en peu de temps, où chaque affirmation renvoie à sa source. CourtOS est open source : chacun peut vérifier ce qu’il fait. Il fonctionne avec n’importe quel modèle, y compris en local. La décision appartient au tribunal. La voix de cette vidéo est synthétique.
