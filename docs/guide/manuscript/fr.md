# Travailler sur un dossier avec CourtOS
Guide du projet pilote | 9 octobre 2026

## 1. Du dossier à la note de travail
Un court parcours d’essai pour les greffières, les greffiers et les juges.

À partir de quatre documents, établir un état du dossier que l’on peut vérifier: quels faits sont étayés? Où les pièces se contredisent-elles? Quelle question importante pour la décision reste ouverte? CourtOS doit vous aider dans ce travail.

- Explorer les pièces
- Cadrer la question juridique
- Rédiger une note de vérification

### Le premier parcours
Ouvrez https://sandbox.swisslaw.io/pilot et saisissez votre adresse e-mail personnelle. Cloudflare Access vous envoie un code à usage unique. Après validation, votre compte est créé automatiquement, sans invitation. Lancez le cas guidé. Prévoyez environ 15 minutes.

### Un essai circonscrit
Le parcours guidé utilise uniquement le dossier fictif fourni. L’espace de travail ouvert, proposé en complément, ne peut être exploré qu’avec des documents de test fictifs. Les critères qui suivent concernent le cas guidé. Les pièces d’exemple sont en allemand; les modèles sont également configurés pour répondre en allemand.

### Votre chemin dans ce guide
Les pièces en page 2, la question juridique en page 3, la note en page 4. Trois exercices figurent en page 5. Le trajet des données et les limites suivent en page 6; les décisions institutionnelles ultérieures en page 7.

## 2. Explorer les pièces
Demandez une chronologie, puis confrontez-la aux documents.

### Un dossier de petite taille
L’autorité de construction de Linden et la personne concernée sont fictives. Quatre documents courts comportent des dates différentes, une inscription au registre et un projet de décision non signé. Aucun canton particulier n’est désigné.

### Lancer le traitement local
Ouvrez les documents fournis et lancez la chronologie. Le modèle local traite ces documents sur le VPS. Aucun service externe ne prend automatiquement le relais.

### Trois points à observer
- Les références aux paragraphes permettent-elles de retrouver les affirmations dans le dossier?
- Les dates contradictoires restent-elles visibles, sans être fusionnées en une date présentée comme certaine?
- La réponse distingue-t-elle un projet encore ouvert d’une décision effectivement rendue?

### Une réponse fluide n’est pas encore un constat fiable.
La date d’une lettre, son envoi et sa notification peuvent différer sans contradiction. À l’inverse, un récit plausible ne résout pas une véritable divergence dans les pièces.

### Prévoir un temps d’attente
Le calcul sur le serveur peut prendre plusieurs minutes. Laissez la tâche en cours se terminer au lieu de relancer plusieurs fois la même étape.

## 3. Autoriser une question juridique
Lisez d’abord le paquet, puis décidez de sa transmission.

### La partie publique
Choisissez l’une des questions générales prédéfinies et les sources publiques prévues. Le catalogue actuel contient la Constitution fédérale et deux arrêts du Tribunal fédéral. Il ne s’agit pas encore d’une recherche en direct dans OpenCaseLaw.

### Examiner réellement l’aperçu
L’aperçu présente la question, les extraits, les instructions au modèle et le prestataire externe. Vérifiez qu’il ne contient que ces éléments publics. Votre autorisation porte sur ce paquet enregistré; un résumé local du dossier n’y a pas sa place.

- Paquet public
- Votre autorisation
- Claude Sonnet 4.6

### Ni anonymisation automatique, ni requête libre sur un cas.
Le dispositif sélectionne des textes publics fixes. Il ne promet pas de retirer les secrets de n’importe quelle saisie. Si un aperçu est incompréhensible ou inattendu, ne l’autorisez pas.

### L’effet de votre autorisation
Seule votre autorisation explicite déclenche l’appel à Anthropic. Elle concerne ce paquet et ne peut servir qu’une fois. Une erreur ne provoque pas de répétition automatique. Un nouvel essai exige un nouveau paquet et une nouvelle autorisation.

## 4. Obtenir une note que l’on peut vérifier
L’appréciation professionnelle reste une tâche humaine.

### Un document de travail utile
Après l’analyse publique, rapprochez les résultats dans l’étape locale. Attendez-vous à une note concise en quatre parties: faits étayés, contradictions, questions importantes encore ouvertes et vérifications à effectuer. L’objectif n’est pas de rédiger une décision définitive.

### Distinguer la source de son interprétation
Pour une affirmation importante, ouvrez la source indiquée. Vérifiez le texte et son contexte. Un extrait et un commentaire rédactionnel sont deux choses différentes. Une règle générale sur le droit d’être entendu ne tranche pas un cas relevant d’une procédure cantonale précise.

### Avant toute reprise
- La référence est-elle correcte et étaye-t-elle l’affirmation?
- Le contexte procédural convient-il, ou une vérification manque-t-elle?
- Les faits, les contradictions et l’appréciation juridique sont-ils distincts?
- La réponse est-elle complète ou s’arrête-t-elle à la limite de sortie?

### Les questions ouvertes sont un résultat
Quelle preuve de notification manque? Existe-t-il une version finale signée? Les pièces déposées ensuite ont-elles réellement été examinées? Une note utile montre ces lacunes au lieu de les combler par des suppositions.

## 5. Trois exercices pour votre essai
Évaluez si le parcours facilite votre travail sur le dossier.

### 1  Étayer une contradiction
Établissez la chronologie et choisissez un conflit de dates. Un bon résultat cite les deux indications et les bons paragraphes, distingue date de la lettre et notification, et précise la pièce manquante pour clarifier la situation.

### 2  Cadrer la question juridique
Choisissez la question prédéfinie sur le droit d’être entendu. Examinez le paquet public avant de l’autoriser, puis vérifiez une affirmation dans l’original. Un bon résultat précise sa limite procédurale et n’affirme pas une nullité automatique.

### 3  Poursuivre le travail à partir de la note
Demandez le rapprochement local des pièces et de l’analyse publique. Un bon résultat distingue faits et appréciation, conserve les contradictions et formule des questions précises. Vous permet-il d’avancer sans devoir relire tout le dossier sans point de repère?

### Un retour utile
Indiquez l’étape, votre attente, l’écart observé et la référence du paragraphe ou de la source. Ajoutez le temps d’attente approximatif. Ne joignez pas de dossier réel à titre d’exemple.

### Quand l’essai n’est pas encore convaincant
Une référence perdue, une contradiction masquée, une transmission obscure ou un texte apparemment achevé malgré des lacunes justifient une amélioration concrète.

## 6. Ce qui se passe en arrière-plan
Ces limites concernent le test actuel sur le VPS.

- Votre navigateur
- Cloudflare
- VPS en Allemagne

### «Local» signifie ici: sur le VPS
Le test fonctionne chez Hetzner en Allemagne, pas encore dans le réseau de votre tribunal. Cloudflare traite le trafic web, y compris les documents et les résultats affichés. Dans le parcours guidé, seul le paquet public expressément autorisé est envoyé à Anthropic.

### Aucun dossier confidentiel
Le contrôle d’accès ne transforme pas ce trajet des données en système institutionnel autorisé. Les pièces réelles confidentielles restent exclues. Aucune anonymisation automatique ne permet de les saisir.

### Tenir compte de l’attente et des limites
Le modèle local Gemma utilise une version économe en mémoire fournie par Unsloth, sur les processeurs du serveur (CPU). Lors de l’essai vérifié, l’assistant libre a fourni en environ six minutes et demie une réponse complète avec des références vérifiables dans le PDF fictif. Cette observation porte sur une seule question ciblée; elle ne garantit ni une durée habituelle ni la qualité générale. Les réponses incomplètes sont signalées.

### Accès, quotas et conservation
Utilisez votre propre compte. Pour le cas guidé, la limite actuelle est de trois tâches locales et d’une analyse externe par personne et par jour civil UTC. Une tâche acceptée compte même si elle échoue; des plafonds communs peuvent limiter l’accès plus tôt. La lecture et l’aperçu sont libres. Les réponses restent enregistrées jusqu’à un nettoyage expressément décidé; la déconnexion ne les efface pas. Les téléchargements restent sur votre appareil.

## 7. La prochaine étape dans l’institution
Après le test sur le VPS: un projet distinct pour un usage institutionnel.

### Choisir le mode d’exploitation
L’informatique existante ou un service séparé dûment autorisé sont des options. Le choix dépend des tâches, des données et des compétences.

### Avant les dossiers réels
- Définir les tâches autorisées et les responsabilités métier et d’exploitation.
- Préciser les lieux de traitement et les accès de tous les prestataires.
- Régler les identités, les droits sur les dossiers, la conservation et l’effacement.
- Assurer l’actualité des sources, le contrôle de qualité et des références vérifiables.
- Convenir de la maintenance, des incidents, des coûts et d’un changement de solution.

### Pas encore une preuve d’aptitude
Une démonstration réussie ne vaut ni autorisation de protection des données, ni certification de sécurité, ni preuve de souveraineté numérique. Le pilote fournit des observations; il ne remplace pas ces décisions.

### Une base logicielle ouverte
CourtOS est un fork de Mike (MikeOSS), projet d’Open Legal Products et de ses contributeurs. La licence du logiciel est GNU AGPL v3.0; les mentions du dépôt font foi.

### Pour aller plus loin
- [CourtOS: code source et licence](https://github.com/jonashertner/CourtOS)
- [Mike: projet d’origine](https://github.com/open-legal-products/mike)

