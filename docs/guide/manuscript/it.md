# Lavorare su un fascicolo con CourtOS
Guida al progetto pilota | 9 ottobre 2026

## 1. Dagli atti alla nota di lavoro
Un breve percorso di prova per le cancelliere, i cancellieri e i giudici.

Da quattro documenti ricavare un quadro verificabile del fascicolo: quali fatti sono documentati? Dove gli atti si contraddicono? Quale questione rilevante per la decisione resta aperta? CourtOS vuole aiutarvi in questo lavoro.

- Esaminare gli atti
- Circoscrivere la domanda
- Preparare una nota di verifica

### Il primo percorso
Aprite https://sandbox.swisslaw.io/pilot e inserite il vostro indirizzo e-mail personale. Cloudflare Access invia un codice monouso. Dopo la conferma, l’account viene creato automaticamente, senza invito. Avviate il caso guidato. Prevedete circa 15 minuti.

### Una prova circoscritta
Il percorso guidato utilizza soltanto il fascicolo fittizio fornito. Lo spazio di lavoro aperto, disponibile in aggiunta, può essere esplorato solo con documenti di prova sintetici. I criteri seguenti riguardano il caso guidato. I documenti di esempio sono in tedesco e anche i modelli sono configurati per rispondere in tedesco.

### Il percorso nella guida
Gli atti a pagina 2, la domanda giuridica a pagina 3, la nota a pagina 4. Tre esercizi si trovano a pagina 5. Percorso dei dati e limiti seguono a pagina 6; le future decisioni istituzionali a pagina 7.

## 2. Esaminare gli atti
Fate elaborare una cronologia, poi confrontatela con i documenti.

### Un fascicolo contenuto
L’autorità edilizia di Linden e la persona interessata sono inventate. Quattro brevi documenti contengono date differenti, un’annotazione nel registro e una bozza di decisione non firmata. Non è indicato un Cantone specifico.

### Avviare il passaggio locale
Aprite i documenti forniti e avviate la cronologia. Il modello locale elabora questi documenti sul VPS. Nessun servizio esterno subentra automaticamente.

### Osservate tre aspetti
- I riferimenti ai paragrafi permettono di ritrovare le affermazioni nel fascicolo?
- Le date contrastanti restano visibili, senza essere fuse in una data presentata come certa?
- La risposta distingue una bozza ancora aperta da una decisione effettivamente emanata?

### Una risposta scorrevole non è ancora un riscontro affidabile.
La data di una lettera, la spedizione e la notificazione possono essere diverse senza contraddirsi. Per contro, un racconto plausibile non risolve un vero contrasto tra gli atti.

### Prevedere un’attesa
Il calcolo sul server può richiedere diversi minuti. Lasciate terminare il lavoro in corso, invece di avviare più volte lo stesso passaggio.

## 3. Autorizzare una domanda giuridica
Prima leggete il pacchetto, poi decidete se trasmetterlo.

### La parte pubblica
Scegliete una delle domande generali predefinite e le fonti pubbliche previste. Il catalogo attuale contiene la Costituzione federale e due sentenze del Tribunale federale. Non è ancora una ricerca in tempo reale in OpenCaseLaw.

### Esaminare davvero l’anteprima
L’anteprima mostra la domanda, gli estratti, le istruzioni al modello e il fornitore esterno. Verificate che contenga soltanto questi elementi pubblici. L’autorizzazione riguarda il pacchetto fissato; un riassunto locale del fascicolo non deve farne parte.

- Pacchetto pubblico
- La vostra autorizzazione
- Claude Sonnet 4.6

### Né anonimizzazione automatica né richieste libere su un caso.
Il sistema seleziona testi pubblici prestabiliti. Non promette di eliminare i segreti da qualsiasi testo inserito. Se un’anteprima è poco chiara o inattesa, non autorizzatela.

### Che cosa comporta l’autorizzazione
Solo la vostra autorizzazione esplicita avvia la chiamata ad Anthropic. Vale per quel pacchetto ed è utilizzabile una sola volta. Un errore non provoca un nuovo invio automatico. Per riprovare servono un nuovo pacchetto e una nuova autorizzazione.

## 4. Ottenere una nota verificabile
La valutazione professionale resta un compito umano.

### Una bozza di lavoro utile
Dopo l’analisi pubblica, collegate i risultati nel passaggio locale. Cercate una nota concisa in quattro parti: fatti documentati, contraddizioni, questioni rilevanti ancora aperte e verifiche da svolgere. Lo scopo non è redigere una decisione definitiva.

### Distinguere fonte e interpretazione
Per un’affermazione importante, aprite la fonte indicata. Controllate il testo e il contesto. Un estratto e un commento redazionale non sono la stessa cosa. Una regola generale sul diritto di essere sentito non risolve un caso soggetto a una specifica procedura cantonale.

### Prima di riprendere un risultato
- Il riferimento è corretto e sostiene l’affermazione?
- Il contesto procedurale è pertinente oppure manca un accertamento?
- Fatti, contraddizioni e valutazione giuridica sono distinguibili?
- La risposta è completa oppure termina al limite di generazione?

### Le questioni aperte sono un risultato
Quale prova di notificazione manca? Esiste una versione finale firmata? I documenti presentati successivamente sono stati davvero esaminati? Una nota utile rende visibili queste lacune, senza colmarle con supposizioni.

## 5. Tre esercizi per la vostra prova
Valutate se il percorso facilita il vostro lavoro sul fascicolo.

### 1  Documentare una contraddizione
Create la cronologia e scegliete un contrasto tra date. Un buon risultato riporta entrambe le indicazioni e i paragrafi corretti, distingue la data della lettera dalla notificazione e precisa quale documento manca per chiarire il punto.

### 2  Circoscrivere la domanda giuridica
Scegliete la domanda predefinita sul diritto di essere sentito. Esaminate il pacchetto pubblico prima di autorizzarlo, poi verificate un’affermazione nell’originale. Un buon risultato indica il limite procedurale e non afferma una nullità automatica.

### 3  Proseguire il lavoro dalla nota
Fate collegare localmente gli atti e l’analisi pubblica. Un buon risultato distingue fatti e valutazioni, mantiene le contraddizioni e formula domande concrete. Vi permette di proseguire senza rileggere tutto il fascicolo senza un orientamento?

### Un riscontro utile
Indicate il passaggio, ciò che vi aspettavate, la differenza osservata e il riferimento al paragrafo o alla fonte. Aggiungete il tempo di attesa approssimativo. Non allegate fascicoli reali come esempio.

### Quando la prova non convince ancora
Un riferimento perso, una contraddizione mascherata, un invio poco chiaro o un testo apparentemente concluso nonostante le lacune sono motivi concreti per migliorare il sistema.

## 6. Che cosa succede dietro le quinte
Questi limiti riguardano il test attuale sul VPS.

- Il vostro browser
- Cloudflare
- VPS in Germania

### «Locale» significa: sul VPS
Il test funziona presso Hetzner in Germania, non ancora nella rete del vostro tribunale. Cloudflare tratta il traffico web, compresi i documenti e i risultati visualizzati. Nel percorso guidato viene inviato ad Anthropic solo il pacchetto pubblico espressamente autorizzato.

### Nessun fascicolo riservato
Il controllo dell’accesso non rende questo percorso dei dati un sistema istituzionale autorizzato. I documenti reali riservati restano esclusi. Nessuna anonimizzazione automatica consente di inserirli.

### Considerare attesa e limiti
Il modello locale Gemma usa una versione a minore occupazione di memoria fornita da Unsloth, sui processori del server (CPU). Nel test verificato, l’assistente libero ha fornito in circa sei minuti e mezzo una risposta completa con riferimenti verificabili nel PDF fittizio. È un’osservazione su una sola domanda mirata, non una garanzia dei tempi abituali o della qualità generale. Le risposte incomplete sono segnalate.

### Accesso, quote e conservazione
Usate il vostro account. Nel caso guidato il limite attuale è di tre attività locali e un’analisi esterna per persona e giorno civile UTC. Le attività accettate contano anche se falliscono; i limiti comuni possono ridurre prima la disponibilità. Lettura e anteprima sono libere. Le risposte restano memorizzate fino a una pulizia espressamente disposta; disconnettersi non le cancella. I file scaricati restano sul vostro dispositivo.

## 7. Il passo successivo nell’istituzione
Dopo il test sul VPS: un progetto distinto per l’impiego istituzionale.

### Scegliere la forma di gestione
Si possono considerare l’informatica esistente o un servizio separato debitamente autorizzato. La scelta dipende dai compiti, dai dati e dalle competenze.

### Prima dei fascicoli reali
- Definire compiti autorizzati e responsabilità professionali e operative.
- Precisare luoghi di trattamento e possibilità di accesso dei fornitori.
- Regolare identità, diritti sui fascicoli, conservazione e cancellazione.
- Garantire fonti aggiornate, controlli di qualità e riferimenti verificabili.
- Concordare manutenzione, gestione dei guasti, costi e cambio di soluzione.

### Non ancora una prova d’idoneità
Una dimostrazione riuscita non vale come autorizzazione in materia di protezione dei dati, certificazione di sicurezza o prova di sovranità digitale. Il progetto pilota fornisce osservazioni; non sostituisce queste decisioni.

### Una base software aperta
CourtOS è un fork di Mike (MikeOSS), progetto di Open Legal Products e dei suoi collaboratori. La licenza del software è GNU AGPL v3.0; fanno fede le indicazioni nel repository.

### Per approfondire
- [CourtOS: codice sorgente e licenza](https://github.com/jonashertner/CourtOS)
- [Mike: progetto originale](https://github.com/open-legal-products/mike)

