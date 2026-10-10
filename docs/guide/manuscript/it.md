# Il tribunale nell’era dell’IA
Guida pratica | 10 ottobre 2026

## 1. Il tribunale nell’era dell’IA
Una guida breve per giudici e cancellieri. Cercare fonti, esaminare gli atti e riprendere i riferimenti con CourtOS.

## 2. Partire dal compito
Che cosa deve migliorare nel lavoro giudiziario?

### Una domanda concreta
Non ogni attività richiede l’IA. Partite da una difficoltà: dove si trova l’affermazione decisiva? Quale documento la sostiene? Che cosa afferma la controparte? Quale questione giuridica resta aperta? Un buon strumento riduce il lavoro di ricerca e facilita queste verifiche.

### Ripensare il lavoro
Richard Susskind pone al centro l’accesso alla giustizia e distingue l’accelerazione dei processi esistenti da una diversa organizzazione del lavoro. James Allsop richiama il potere giudiziario, il suo carattere umano e i limiti dei soli indicatori di rendimento. [1, 2, 3]

### Il criterio
Ne ricaviamo un principio per CourtOS: ogni affermazione rilevante deve rimandare a un passaggio verificabile. Incertezze e contraddizioni devono restare visibili. È una proposta progettuale, non una prova di migliore giustizia.

## 3. Il giudizio resta umano
L’IA propone. Il tribunale risponde dei motivi della decisione.

### Il quadro giuridico
L’art. 29 Cost. tutela l’equità del procedimento, il diritto di essere sentiti e un termine ragionevole. L’art. 29a garantisce in linea di principio l’accesso al giudice. L’art. 30 esige un tribunale fondato sulla legge, competente, indipendente e imparziale; l’art. 191c assoggetta le autorità giudiziarie soltanto al diritto nella loro attività giurisdizionale. [4]

### Motivi, non solo una buona formulazione
La motivazione deve rendere riconoscibili le considerazioni decisive e consentire un’impugnazione adeguata. Una risposta scorrevole dell’IA non basta. [5]

### Giudice unico o collegio
Proponiamo lo stesso metodo: verificare le fonti, conservare le obiezioni e assegnare le responsabilità. In un collegio di tre o cinque giudici ciascuno deve poter formare una propria valutazione. Resta possibile una discussione comune iniziale. Il progetto pilota non offre funzioni specifiche di deliberazione o voto.

## 4. Dove vanno i dati
«Locale» significa qui: sul server CourtOS in Germania.

### Tre percorsi distinti
- I vostri PDF e Gemma 4: conservazione e trattamento tramite il modello sul server Switchboard presso Hetzner, in Germania. Non sul vostro computer.
- OpenCaseLaw: i termini che inviate espressamente vanno al servizio pubblico di ricerca, che usa IA esterna. La biblioteca e il documento Word non vengono trasmessi.
- Claude Opus 5.5: la verifica esterna invia ad Anthropic il testo approvato, soltanto dopo l’anteprima completa e la vostra conferma.

### La connessione
Cloudflare gestisce l’accesso e il traffico web, trattando anche i contenuti visualizzati. Il verde indica Gemma, il viola la verifica esterna. Il testo indica il fornitore e il percorso dei dati.

### La prova attuale
Usate decisioni pubbliche, dottrina non riservata che avete diritto di utilizzare o documenti fittizi. Nessun fascicolo reale o documento riservato. L’accesso non equivale a un’autorizzazione istituzionale. Non è disponibile un’anonimizzazione automatica.

## 5. Cercare e continuare a scrivere
Il riferimento deve accompagnarvi nel vostro strumento di lavoro.

### Aprire
Nel browser: https://sandbox.swisslaw.io/research. Accedete con il vostro indirizzo e-mail e il codice ricevuto. In Word aprite il componente aggiuntivo CourtOS installato. Scegliete le fonti prima di porre una domanda.

### Cercare fonti pubbliche
Scegliete «Cerca giurisprudenza», poi OpenCaseLaw. Inserite il riferimento di una decisione o poche parole chiave. I risultati sono limitati; la loro assenza non prova l’assenza di giurisprudenza. Non inserite nomi o fatti riservati.

### Riprendere un passaggio
Aprite la decisione e verificate l’originale. Selezionate un breve passaggio, confermate la selezione e copiate testo e fonte oppure inseriteli in Word. Il collegamento di ricerca nell’originale tenta di ritrovare il passaggio. Non certifica un numero ufficiale di paragrafo; il collegamento all’intero documento non è un riferimento puntuale.

### Più spazio nel browser
Da Word aprite il browser e proseguite con lo stesso account. Poi ritrasferite la ricerca in Word. Se i due stati divergono, scegliete quale riprendere. Il trasferimento vale due ore; non avvia una nuova ricerca e non modifica da solo il documento.

### Controllare i riferimenti
In «Citazioni», scegliete le versioni PDF e avviate «Verifica i riferimenti». Citecheck confronta numeri delle decisioni, date e suddivisioni riconosciute con l’elenco OpenCaseLaw salvato. Un risultato porta al passo del vostro atto; le voci corrispondenti rimandano alla decisione intera. «Non trovato» significa soltanto: assente dall’elenco. Verificate testo e portata nell’originale.

## 6. Aggiungere le proprie fonti
Scegliete le fonti originali. Ponete domande. Verificate i passaggi citati.

### Ordinare per numero di causa
Create nella biblioteca una cartella con il numero di causa. Al suo interno ordinate le parti, i loro scritti e gli allegati; tenete separati gli atti comuni. Caricate i PDF nella cartella corretta. CourtOS salva copie sul server.

### Scegliere le fonti
Con «Scegli le tue fonti» selezionate i PDF degli atti e della vostra letteratura per la conversazione. Potete aggiungere brevi estratti OpenCaseLaw scelti espressamente. I due gruppi di fonti sono così riuniti. La semplice ricerca nei vostri documenti non usa l’IA.

### Porre domande e precisarle
Chiedete quali importi menziona uno scritto o in cosa divergono due ricostruzioni dei fatti. Gemma lavora sulle fonti scelte. Le domande successive usano le stesse versioni; iniziate una nuova conversazione per altre fonti. Senza fonti non parte alcuna richiesta.

### Verificare la risposta
Ogni paragrafo della risposta deve contenere un riferimento verificato. Aprite il passaggio e leggete il contesto. Senza un riferimento valido, la risposta non viene mostrata. I collegamenti ai vostri PDF restano riservati agli account autorizzati.

### Ritrovare il testo non prova la conclusione
Il controllo conferma il passaggio e la citazione, non la conclusione. Un’allegazione resta un’allegazione. La pagina PDF può differire dalla pagina stampata.

## 7. Esaminare gli atti
Accostare affermazioni e documenti in un elenco da verificare.

### Preparare
Aprite «Esaminare gli atti». Aggiungete alla biblioteca brevi petizioni, risposte e allegati fittizi. Scegliete versioni, ruoli, parti e lingua del rapporto. «Fascicoli di esempio» offre quattro esercizi in tedesco, francese, italiano e inglese. «Importare i quattro PDF» archivia il fascicolo scelto sotto un numero fittizio, in cartelle per parte e per estratti comuni. I documenti sono ricostruiti da decisioni pubblicate; non sono gli atti originali. Verificate poi ruoli e parti.

### Tre compiti
- Fatti e prove: allegazione, documento selezionato e posizione avversa sono affiancati. «Sostiene» o «Contraddice» richiede una fonte selezionata come allegato probatorio. Un’altra allegazione non sostituisce una prova; la valutazione sostanziale resta una proposta dell’IA.
- Argomentazioni giuridiche: il confronto riguarda soltanto le fonti scelte. Decisioni e opere mancanti non vengono reperite automaticamente. Cercate separatamente i riferimenti pubblici.
- Cronologia: le date precise vengono ordinate. Le date approssimative o mancanti restano separate. Le versioni contrastanti mantengono voci distinte.

### Leggere il risultato
Scegliete «Avvia l’analisi parziale». Il rapporto contiene al massimo dodici righe e indica fonti, versioni e pagine lette. Aprite i riferimenti. Il controllo letterale conferma un passaggio, non la valutazione dell’IA né la verità di un’affermazione di parte.

### Un’analisi parziale in prova
L’IA può omettere affermazioni anche se riceve tutto il testo. Le selezioni troppo ampie sono rifiutate; le bozze con passaggi non confermati non vengono mostrate. Verificate voi stessi omissioni e motivi: l’affidabilità di questo percorso è ancora in fase di prova.

## 8. Usare l’IA per un compito preciso
Scegliete il compito e le sole fonti necessarie.

### Gemma sul server CourtOS
Nel browser: l’assistente può preparare una bozza sulla base dei PDF scelti. L’invio avvia l’analisi. Il modello usa una versione Unsloth e funziona sui processori del server; sono possibili attese. Gemma non garantisce risposte corrette. L’applicazione indica i limiti d’uso.

### Una verifica esterna
Nel browser: trasferite alla verifica esterna un breve passaggio che può essere trasmesso. Modificate istruzione e testo. Controllate l’anteprima completa, il fornitore e il modello. Gli allegati e il resto della conversazione non vengono aggiunti automaticamente. Il contenuto dei collegamenti non viene consultato.

### Usare la risposta
La risposta esterna può tornare come bozza modificabile. Non viene inviata di nuovo automaticamente. Verificate ogni affermazione decisiva sull’originale. La risposta convincente di un secondo modello non è una verifica indipendente delle fonti.

## 9. Ritrovare il lavoro svolto
Le conversazioni esistono. Una storia completa del lavoro è prevista.

### A cosa serve lo storico
CourtOS conserva le conversazioni personali e i riferimenti alle fonti; potete riaprirle. Uno storico utile dovrebbe mostrare anche ciò che avete accolto, scartato o modificato e perché un punto resta aperto. Questa ulteriore traccia del lavoro non è ancora realizzata.

### Distinguere tre livelli
- Conversazione: domanda, risposta, versioni esatte delle fonti, modello e luogo di elaborazione.
- Risultato di lavoro salvato: quanto ripreso consapevolmente, con attribuzione, stato della verifica, riferimenti, controargomenti e questioni aperte. La vostra ipotesi di lavoro non è un accertamento giudiziario; le allegazioni contestate restano riconoscibili.
- Vostra motivazione: ragioni verificate e modifiche, con versione precedente, data e autore. Una proposta dell’IA entra nel lavoro solo attraverso un vostro intervento consapevole.

### Proteggere la riflessione personale
Riflessioni personali e appunti di deliberazione non dovrebbero essere condivisi per impostazione predefinita. Lo storico documenta passaggi e scelte motivate; non promette l’accesso ai pensieri nascosti di un modello. Una risposta dell’IA non è un mezzo di prova.

### Sviluppi previsti
Sono previsti anche progetti di decisione guidati dal tribunale, l’esame di questioni fondamentali e di varianti ipotetiche con le loro conseguenze. Le ipotesi dovrebbero rimanere distinte dai riscontri negli atti. Queste funzioni non sono ancora disponibili.

## 10. Una memoria per la causa
Il progetto è uno stato di lavoro privato collegato alle fonti, non un secondo fascicolo di affermazioni non verificate.

### Collegare persone e termini
Un registro privato dovrebbe collegare nomi reali, varianti documentate, ruoli e termini sostitutivi approvati. Comprenderebbe persone, imprese, luoghi e immobili. Identità e ruolo resterebbero distinti: una persona può avere più ruoli. Ogni collegamento richiede una fonte; identità incerte non vengono unite automaticamente.

### Due versioni leggibili
File Markdown interni conserverebbero il lavoro con nomi reali e riferimenti puntuali. Solo dalle voci espressamente scelte nascerebbe una versione pseudonimizzata, verificata per l’IA esterna. Documenti e appunti userebbero gli stessi termini del registro privato. Non sarebbero due verità mantenute separatamente. La corrispondenza con i nomi reali resterebbe interna.

### Rendere visibili i cambiamenti
Se cambia una fonte o una corrispondenza, le voci interessate sarebbero da riesaminare. Le esportazioni interessate perderebbero l’approvazione. Le conclusioni precedenti non verrebbero sostituite in silenzio. Ogni versione derivata manterrebbe un collegamento privato alla versione e al passaggio originali. Il testo modificato dovrebbe restare riconoscibile come derivato.

### Approvare ogni uso esterno
Il nome di una cartella non autorizza un invio. Domanda, appunti selezionati e storico devono figurare nell’anteprima esatta. Il passaggio all’IA esterna apre una nuova conversazione, senza riprendere automaticamente nomi privati o precedenti conversazioni locali. I nomi sostitutivi non garantiscono l’anonimato. Questa memoria e questo percorso di esportazione non sono ancora realizzati.

## 11. Provare, poi decidere l’adozione
Un progetto pilota utile produce osservazioni, non promesse.

### Valutare l’utilità
Usate un piccolo caso di prova con affermazioni, documenti e contraddizioni noti. Contate le affermazioni omesse e inventate. Verificate parti, importi, date e riferimenti. Misurate anche attese e correzioni. Confrontate il risultato con il metodo abituale.

### Prima dei fascicoli reali
L’istituzione deve disciplinare compiti ammessi, accessi dei fornitori, autorizzazioni, conservazione, cancellazione, gestione e responsabilità professionali. Word per macOS è stato provato con un documento fittizio; altre versioni e ambienti istituzionali richiedono prove proprie.

### Che cosa manca
Il lavoro diretto in una cartella locale e una pseudonimizzazione coerente tra più documenti restano sviluppi futuri. Nomi sostitutivi non bastano a rendere anonimi i documenti. Un progetto pilota riuscito non sostituisce questi sviluppi né l’approvazione giuridica e tecnica.

### Software aperto
- [CourtOS · Codice sorgente e GNU AGPL v3.0](https://github.com/jonashertner/CourtOS)

## 12. Fonti e portata
Basi delle posizioni e regole espressamente attribuite; verificate il 9 ottobre 2026.

- [1. Richard Susskind · Online Courts and the Future of Justice](https://academic.oup.com/oxford-law-pro/book/41081)

Sintesi dell’editore e indice, parte II. Il libro completo non è stato esaminato.

- [2. Richard Susskind · Corrected oral evidence: Constitutional implications of Covid-19](https://committees.parliament.uk/oralevidence/462/html/)

Verbale ufficiale della Camera dei lord, 3 giugno 2020, domanda 30; contesto: domande 23–24 e 29.

- [3. James Allsop · Technology and the Future of the Courts](https://www.fedcourt.gov.au/__data/assets/pdf_file/0017/55520/Allsop-CJ-20190326.pdf)

Conferenza del 26 marzo 2019, pp. 2–4 e 11–12, pubblicata dalla Corte federale australiana.

- [4. Costituzione federale · RS 101](https://www.fedlex.admin.ch/eli/cc/1999/404/it)

Art. 29 cpv. 1–2, 29a, 30 cpv. 1 e 3 e 191c. Versione esaminata: 3 marzo 2024.

- [5. Tribunale federale · DTF 129 I 232](https://www.bger.ch/ext/eurospider/live/de/php/clir/http/index.php?lang=de&type=show_document&highlight_docid=atf://129-I-232:de)

Consid. 3.2, pp. 236–237. Si riprende soltanto il principio generale della motivazione; la decisione riguardava una naturalizzazione.

### Questa edizione
Metodi di lavoro e criteri progettuali sono nostre proposte. Non dimostrano né un guadagno di produttività né la liceità di un uso specifico dell’IA. Stato delle funzioni: 10 ottobre 2026. Verifica delle fonti, qualità del modello e approvazione istituzionale restano compiti distinti.

