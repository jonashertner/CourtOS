# Le tribunal à l’ère de l’IA
Guide pratique | 10 octobre 2026

## 1. Le tribunal à l’ère de l’IA
Un guide bref pour les juges et les greffières et greffiers. Rechercher, examiner des écritures et reprendre des références avec CourtOS.

## 2. Partir de la tâche
Qu’est-ce qui doit s’améliorer dans le travail judiciaire?

### Une question concrète
Toute tâche ne demande pas de l’IA. Partez d’une difficulté: où se trouve l’allégation décisive? Quelle pièce l’étaye? Que soutient la partie adverse? Quelle question juridique reste ouverte? Un bon outil réduit le travail de recherche et facilite cet examen.

### Revoir la manière de travailler
Richard Susskind interroge l’accès à la justice et distingue l’accélération des pratiques existantes d’une autre organisation du travail. James Allsop rappelle le pouvoir judiciaire, sa dimension humaine et les limites des seuls indicateurs de performance. [1, 2, 3]

### Le critère retenu
Nous en tirons un principe pour CourtOS: toute affirmation importante doit mener à un passage vérifiable. Incertitudes et contradictions doivent rester visibles. C’est une proposition de conception, pas la preuve d’une justice meilleure.

## 3. Le jugement reste humain
L’IA propose. Le tribunal répond de ses motifs.

### Le cadre juridique
L’art. 29 Cst. protège une procédure équitable, le droit d’être entendu et un délai raisonnable. L’art. 29a garantit en principe l’accès au juge. L’art. 30 exige un tribunal établi par la loi, compétent, indépendant et impartial; l’art. 191c soumet les autorités judiciaires au seul droit dans leur activité juridictionnelle. [4]

### Des motifs, pas seulement une belle rédaction
La motivation doit exposer les considérations décisives et permettre de contester utilement la décision. Une réponse fluide de l’IA n’y suffit pas. [5]

### Juge unique ou collège
Notre proposition vaut pour les deux: vérifier les sources, conserver les objections et attribuer les responsabilités. Dans un collège de trois ou cinq juges, chacun doit pouvoir former sa propre appréciation. Une discussion commune précoce reste possible. Le pilote ne comprend pas de fonctions spécifiques de délibération ou de vote.

## 4. Où vont les données
«Local» signifie ici: sur le serveur CourtOS en Allemagne.

### Trois circuits distincts
- Vos PDF et Gemma 4: stockage et traitement par le modèle sur le serveur Switchboard chez Hetzner, en Allemagne. Pas sur votre ordinateur.
- OpenCaseLaw: les termes que vous envoyez expressément vont au service public de recherche, qui utilise une IA externe. Votre bibliothèque et votre document Word ne sont pas transmis.
- Claude Opus 5.5: l’analyse externe transmet à Anthropic le texte que vous avez approuvé, après aperçu complet et confirmation.

### La connexion
Cloudflare assure l’accès et le trafic web et traite aussi les contenus affichés. Le vert signale Gemma, le violet l’analyse externe. Le texte indique le fournisseur et le circuit de traitement.

### Le cadre de l’essai
Utilisez des décisions publiques, de la doctrine non confidentielle que vous avez le droit d’utiliser, ou des documents fictifs. Aucun dossier réel ni document confidentiel. Se connecter ne vaut pas autorisation institutionnelle. Il n’existe pas d’anonymisation automatique.

## 5. Rechercher, puis continuer à rédiger
La référence doit vous suivre dans votre outil de travail.

### Ouvrir
Dans le navigateur: https://sandbox.swisslaw.io/research. Connectez-vous avec votre adresse électronique et le code reçu. Dans Word, ouvrez le complément CourtOS installé. La recherche ne demande ni projet ni conversation.

### Chercher dans les sources publiques
Choisissez OpenCaseLaw. Saisissez la référence d’une décision ou quelques termes publics; sélectionnez une langue si nécessaire. Les résultats sont limités. Une absence de résultat ne prouve pas une absence de jurisprudence. Ne saisissez aucun nom ni fait confidentiel.

### Reprendre un passage
Ouvrez la décision et vérifiez l’original. Sélectionnez un court passage, confirmez la sélection, puis copiez le texte avec sa source ou insérez-le dans Word. Le lien de recherche dans l’original tente de retrouver le passage. Il ne certifie aucun numéro de paragraphe; un lien vers le document entier n’est pas une référence précise.

### Travailler sur un écran plus large
Depuis Word, ouvrez le navigateur et poursuivez avec le même compte. Renvoyez ensuite votre recherche vers Word. Si les deux états diffèrent, choisissez celui à reprendre. Le transfert reste valable deux heures; il ne relance aucune recherche et ne modifie pas spontanément votre document.

### Vérifier les références
«Citations» ouvre Citecheck séparément. CourtOS ne lui transmet aucun texte. Vérifiez dans l’arrêt original s’il étaye votre affirmation.

## 6. Ajouter vos propres sources
La bibliothèque complète la jurisprudence par les documents que vous choisissez.

### Importer
Ajoutez des PDF dans «Bibliothèque». Un nom clair avec auteur, titre et édition facilite leur identification. CourtOS stocke une copie sur le serveur; il ne lit pas directement un dossier local. Les limites d’import figurent dans l’interface.

### Rechercher
Dans la recherche, choisissez «Vos sources» et les documents voulus. Cette recherche n’utilise pas d’IA. Chaque résultat indique passage, version et page PDF. Des scans illisibles ou une indexation partielle peuvent laisser des lacunes.

### Conserver la référence
Ouvrez la page et lisez le contexte. Copiez ou insérez le passage avec nom du fichier, version, page et lien protégé. Ce lien ouvre la version enregistrée pour le compte autorisé; il n’accorde aucun accès à un tiers.

### Distinguer le texte de sa portée
Une citation retrouvée mot pour mot peut être incomplète ou sans pertinence pour la question juridique. Vérifiez ce qu’elle permet d’affirmer. La page PDF ne correspond pas nécessairement à la page imprimée.

## 7. Examiner les écritures
Rapprocher les allégations et les pièces dans une liste à vérifier.

### Préparer
Ouvrez «Examiner les écritures». Ajoutez à la bibliothèque de brèves demandes, réponses et pièces fictives. Choisissez les versions, les rôles, les parties et la langue du rapport. «Dossiers d’exemple» propose quatre exercices en allemand, français, italien et anglais. «Importer les quatre PDF» classe le dossier choisi sous un numéro fictif, avec des dossiers par partie et des extraits communs. Les documents sont reconstitués à partir d’arrêts publiés; ce ne sont pas les actes originaux. Vérifiez ensuite les rôles et les parties.

### Trois tâches
- Faits et preuves: allégation, pièce et position adverse apparaissent côte à côte. L’IA propose «Soutient l’énoncé», «Contredit l’énoncé», «Reste indéterminé» ou «Non trouvé dans la sélection».
- Arguments juridiques: la comparaison porte uniquement sur les sources choisies. Les décisions et ouvrages absents ne sont pas obtenus automatiquement. Recherchez séparément les références publiques.
- Chronologie: les dates précises sont ordonnées. Les dates approximatives ou absentes restent à part. Les versions contradictoires gardent des entrées distinctes.

### Lire le résultat
Choisissez «Lancer l’analyse partielle». Le rapport comprend au maximum douze lignes et indique les sources, versions et pages lues. Ouvrez les références. Le contrôle littéral confirme un passage, pas l’appréciation de l’IA ni la vérité d’une allégation.

### Une analyse partielle à l’essai
L’IA peut omettre des affirmations même si tout le texte lui est fourni. Les sélections trop grandes sont refusées; les projets dont les passages ne sont pas confirmés ne sont pas affichés. Vérifiez vous-même les omissions et les motifs: la fiabilité de ce parcours reste à établir.

## 8. Recourir à l’IA pour une tâche précise
Choisissez le travail demandé et les seules sources nécessaires.

### Gemma sur le serveur CourtOS
Dans le navigateur: l’assistant peut préparer un projet à partir des PDF choisis. L’envoi lance l’analyse. Le modèle utilise une version Unsloth et fonctionne sur les processeurs du serveur; des attentes sont possibles. Gemma ne garantit pas des réponses justes. L’application indique les limites d’usage.

### Une analyse externe
Dans le navigateur: transférez vers l’analyse externe un court passage dont la transmission est permise. Modifiez la consigne et le texte. Vérifiez l’aperçu complet, le fournisseur et le modèle. Les pièces jointes et le reste de la conversation n’y sont pas ajoutés automatiquement. Le contenu des liens n’est pas consulté.

### Utiliser la réponse
La réponse externe peut revenir comme projet modifiable. Elle n’est pas renvoyée automatiquement. Vérifiez chaque affirmation décisive dans l’original. L’avis convaincant d’un second modèle ne constitue pas un contrôle indépendant des sources.

## 9. Essayer, puis décider de l’adoption
Un pilote utile apporte des observations, pas des promesses.

### Évaluer le bénéfice
Prenez un petit cas test dont vous connaissez les allégations, pièces et contradictions. Comptez les affirmations omises et inventées. Vérifiez parties, montants, dates et références. Mesurez aussi l’attente et les corrections. Comparez avec votre pratique habituelle.

### Avant les dossiers réels
L’institution doit régler les tâches admises, les accès des fournisseurs, les droits d’accès, la conservation, l’effacement, l’exploitation et les responsabilités professionnelles. Word pour macOS a été essayé avec un document fictif; les autres versions et environnements institutionnels demandent leurs propres essais.

### Ce qui reste à développer
Le travail direct dans un dossier local et une pseudonymisation cohérente entre plusieurs documents sont des étapes futures. Des noms de remplacement ne suffisent pas à rendre les pièces anonymes. Un pilote réussi ne remplace ni ce développement ni l’autorisation juridique et technique.

### Logiciel ouvert
- [CourtOS · Code source et GNU AGPL v3.0](https://github.com/jonashertner/CourtOS)

## 10. Sources et portée
Fondements des positions et règles expressément attribuées; vérifiés le 9 octobre 2026.

- [1. Richard Susskind · Online Courts and the Future of Justice](https://academic.oup.com/oxford-law-pro/book/41081)

Résumé de l’éditeur et table des matières, partie II. L’ouvrage intégral n’a pas été examiné.

- [2. Richard Susskind · Corrected oral evidence: Constitutional implications of Covid-19](https://committees.parliament.uk/oralevidence/462/html/)

Compte rendu officiel de la Chambre des lords, 3 juin 2020, question 30; contexte: questions 23–24 et 29.

- [3. James Allsop · Technology and the Future of the Courts](https://www.fedcourt.gov.au/__data/assets/pdf_file/0017/55520/Allsop-CJ-20190326.pdf)

Conférence du 26 mars 2019, p. 2–4 et 11–12, publiée par la Cour fédérale d’Australie.

- [4. Constitution fédérale · RS 101](https://www.fedlex.admin.ch/eli/cc/1999/404/fr)

Art. 29, al. 1–2, 29a, 30, al. 1 et 3, et 191c. Version examinée: 3 mars 2024.

- [5. Tribunal fédéral · ATF 129 I 232](https://www.bger.ch/ext/eurospider/live/de/php/clir/http/index.php?lang=de&type=show_document&highlight_docid=atf://129-I-232:de)

Consid. 3.2, p. 236–237. Seul le principe général de motivation est repris; l’arrêt concernait une naturalisation.

### À propos de cette édition
Les méthodes de travail et règles de conception sont nos propositions. Elles ne prouvent ni un gain de productivité ni la licéité d’un usage précis de l’IA. État des fonctions: 10 octobre 2026. Contrôle des sources, qualité du modèle et autorisation institutionnelle restent distincts.

