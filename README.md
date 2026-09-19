# Readda

Un'app per recuperare le parole della propria lingua. Non quelle che non si conoscono:
**quelle che si conoscono e non si usano mai.**

Nessun account, nessuna email, nessun server. Tutto sta nel browser.

---

## La scelta di progetto che conta

La specifica iniziale prevedeva tre azioni sul flusso, con il grosso della macchina
(ripetizione dilazionata, notifiche, test) dedicato a **«non conosco»**.

Questa versione ribalta i pesi, e vale la pena sapere perché:

| Azione | Cosa succede | Perché |
|---|---|---|
| **Non la conosco** | Entra nel ripasso a **riconoscimento**: scelta multipla fra quattro definizioni. | È la categoria con il rendimento più basso: sono parole senza nessun aggancio nella vita di chi legge. Meritano una macchina, non *la* macchina. |
| **La conosco, non la uso** | Entra nel ripasso a **produzione**: bisogna scrivere una frase vera che la contenga. Serve a nulla rispondere «sì, l'ho usata». | È l'unica zona dove il guadagno è immediato: la parola è già in memoria passiva, manca solo il ponte verso l'uso. Qui sta il cuore del prodotto. |
| **La uso già** | Passa oltre. Ma nel **18% dei casi l'app bluffa**: due giorni dopo ti chiede di dimostrarlo. | L'autovalutazione è il dato più inaffidabile che esista: si riconosce la forma grafica e la si scambia per conoscenza. Senza un controllo a campione, questo pulsante diventa il tasto «avanti» e l'app non impara nulla. |

Di conseguenza:

- Una parola diventa «tua» dopo **tre frasi scritte**, mai dopo un tocco su «lo so».
- Una parola riconosciuta abbastanza volte non esce dal sistema: **passa da ignota a passiva**,
  perché riconoscere non è usare.
- Il ripasso mette **sempre la produzione prima** del riconoscimento.

## L'accesso

Il nickname è il metodo di accesso, come da specifica. Senza nient'altro, però, il primo
cambio di telefono cancella mesi di lavoro — quindi alla registrazione viene generato un
**codice di ripristino** e, da *Io → Backup*, si esporta una stringa che contiene tutto.
È l'onesto massimo possibile senza un server: i dati viaggiano con chi li ha scritti.

Più persone possono usare lo stesso dispositivo: gli account sono indicizzati per nickname.

---

## Provarla

Basta un server statico qualsiasi, perché il service worker e il manifest non funzionano
da `file://`:

```bash
npx http-server -p 8777 .      # poi apri http://127.0.0.1:8777
```

Non c'è niente da compilare e non ci sono dipendenze a runtime: HTML, CSS e JavaScript
semplice (script classici, nessun modulo), così l'app si può anche solo copiare su
GitHub Pages o su qualunque cartella servita via HTTP.

## Il ciclo: aggiungere parole nel tempo

```bash
python3 strumenti/aggiorna.py                  # ciclo completo
python3 strumenti/aggiorna.py --salta-scarico  # riusa le fonti gia' prese
python3 strumenti/aggiorna.py --solo-report    # confronta senza toccare niente
```

Scarica il dump piu' recente del Wikizionario e la lista di frequenza, riestrae,
ricostruisce i blocchi e stampa cosa e' cambiato: quante voci nuove, quante
tolte, quante definizioni aggiornate. Lo storico delle esecuzioni finisce in
`data/storico.json`.

La pipeline sta tutta in `strumenti/`:

| File | Cosa fa |
|---|---|
| `aggiorna.py` | Orchestra il ciclo e riporta le differenze |
| `estrai.py` | Dal dump alle voci grezze: markup via, campi fuori |
| `costruisci.py` | Filtri, livelli, domini, tipografia, scrittura dei blocchi |
| `curati.js` | Le 134 voci scritte a mano, che vincono sugli omonimi automatici |

Per aggiungere lemmi propri basta scriverli in `curati.js` e rieseguire: hanno
sempre la precedenza sulla versione automatica.

## Le prove

```bash
node test/prova.js                                  # logica: corpus, SRS, account, flessione
NODE_PATH=$(npm root -g) node test/e2e.js           # interfaccia vera in Chromium + schermate
node test/icone.js                                  # rigenera le icone PWA
```

`test/e2e.js` vuole un server attivo sulla porta 8777 e Chromium; scrive le schermate
in `scatti/`. Le due suite insieme fanno **142 asserzioni** e hanno trovato quattordici
difetti veri, tutti corretti:

| Difetto | Perché contava |
|---|---|
| La barra di navigazione intercettava i tocchi mentre era nascosta | `[hidden]` perde contro `display:grid`: bloccava l'onboarding, nessuno arrivava al flusso |
| La carta del flusso finiva sotto i pulsanti azione | Il centraggio era calcolato su un'area che li includeva |
| Le liste sforavano lo schermo di 250px | Il track di griglia `auto` cresce fino al contenuto: serve `minmax(0,1fr)` |
| I participi irregolari non erano riconosciuti | `eludere` → `eluso`: una frase corretta veniva rifiutata |
| Identificatori con una **а cirillica** al posto della `a` | Coerenti, quindi funzionanti — ma la prima modifica che avesse scritto `ferma` in latino sarebbe stata un `ReferenceError` silenzioso |
| Una classe di caratteri regex scritta con **diacritici combinanti letterali** | Caratteri invisibili attaccati alla parentesi quadra, illeggibili e fragili alla ri-codifica |
| Stringhe in forma **decomposta** (`Gia` + accento combinante) | Si vedono uguali, ma una ricerca per «Già» non le trova |
| Il campo `forme` non veniva esportato nei blocchi | I participi irregolari tornavano a essere rifiutati, in silenzio |
| `radice_lemma` tagliava i suffissi da una lista, e la lista aveva un buco | Mancava `-ico`, quindi «ironico: incline all'ironia» passava il filtro anticircolare |
| 116 esempi non contenevano la parola che dovevano illustrare | Sulla carta compariva una frase che non c'entrava nulla col lemma |
| 5 definizioni con markup wiki sopravvissuto (`attaccate]].`) | Parentesi spaiate emerse dopo la decodifica delle entità HTML |
| Le note legali erano rese al 16% di opacità | Un'attribuzione CC BY-SA illeggibile non soddisfa la licenza |
| Gli interessi funzionavano da filtro invece che da inclinazione | Un mese d'uso dava al profilo «medico» 450 parole mediche e zero lessico generale |
| Dentro ogni strato la coda ordinava per peso invece di estrarre | Lo stesso difetto un livello più in basso: 18.000 estrazioni senza mai pescare un lemma di peso 1 |

Gli ultimi tre erano latenti: nessuno rompeva l'app quel giorno, tutti l'avrebbero rotta
alla prima modifica. `test/prova.js` ora contiene le guardie che li impediscono di
tornare.

---

## Com'è fatta

```
index.html               guscio e ordine di caricamento
assets/styles.css        sistema visivo (variabili, componenti)
data/manifesto.js        conteggi del corpus: 731 byte, l'unico dato caricato all'avvio
data/blocco-NN.js        64 blocchi da ~52 KB, assegnati per hash del lemma
strumenti/               la pipeline che genera il corpus
js/corpus.js             caricamento dei blocchi su richiesta
js/store.js              stato e persistenza su localStorage, per nickname
js/srs.js                Leitner a 6 caselle, coda del flusso, confronto per radice
js/notify.js             promemoria lato client
js/ui.js                 utilità condivise (escape, foglio modale, brindisi)
js/views/*.js            una vista per schermata
js/app.js                instradamento via hash
sw.js                    guscio offline
```

**Il corpus. 11.326 voci**, di cui 134 scritte a mano e 11.192 ricavate dal
Wikizionario italiano. Non e' il Wikizionario travasato: di 782.769 pagine lette
ne sopravvive l'1,4%, perche' la pipeline tiene solo cio' che serve a questo
prodotto. Ogni voce porta categoria grammaticale, sillabazione con accento
tonico (`de·no·ta·zió·ne`), definizione, sinonimi, dominio, registro, livello di
rarita' e, dove c'e', un esempio d'uso.

Il criterio di selezione e' quello che decide se l'app funziona, e distingue due
cose che all'inizio avevo confuso in una sola:

| | |
|---|---|
| **Aderenza** | Quanto la parola serve a chi vuole parlare meglio. Decide se entra. |
| **Completezza** | Quanto la scheda e' ricca. Ordina, non esclude. |

Senza questa separazione in cima finiscono `sabotare` e `contagiare`, che tutti
usano gia', e in fondo `zappa` e `siringa`, che nessuno deve imparare.

Cosa viene scartato, e perche':

| Scarto | Voci | Motivo |
|---|---:|---|
| Non e' lessico da prodotto | 11.147 | Oggetti concreti, parole quotidiane, aggettivi di provenienza |
| Definizione circolare | 3.749 | «ironico: che si esprime con ironia» non insegna niente |
| Coda troppo rara | 3.402 | `antibechico`, `opsonizzante`: nessuno le riconosce |
| Rimanda a un'altra voce | 2.230 | «diminutivo di...», «variante di...» |
| Troppo comune | 631 | Sotto il rango 1.500 nella lista di frequenza |
| Forma flessa | 450 | «terza persona singolare di...» |
| Citazione al posto della glossa | 77 | Un verso di Foscolo non e' una definizione |

Il filtro piu' importante e' la **trasparenza morfologica**: `distinguibile` e
`controproducente` si ricavano da parole che gia' si conoscono, quindi impararle
non cambia come si parla. `blandire` e `accidia` no: quelle sono il prodotto.

**Lessico esplicito.** Il Wikizionario è un dizionario completo: contiene anche
parole volgari e voci sessualmente esplicite, e un flusso casuale può metterle
davanti a chiunque. 33 voci (lo 0,29%) sono segnate e restano fuori dal flusso
finché non si accende l'interruttore in *Io*. La marcatura guarda la parola, non
la definizione, ed esclude a mano gli omografi innocenti; i termini clinici e
quelli neutri su identità e orientamento **non** sono segnati. Dettagli in
[FONTI.md](FONTI.md).

**Il livello** viene dal rango di frequenza su OpenSubtitles: 1.500-20.000 e'
livello 1, fino a 80.000 livello 2, oltre (o assente) livello 3. La fascia
15.000-200.000 e' il centro di gravita' del prodotto, dove stanno le parole che
si riconoscono leggendo e non si dicono mai.

**Come sta in memoria.** 3,4 MB di corpus non si caricano all'avvio. Le voci
sono divise in 64 blocchi da circa 52 KB, e il blocco di un lemma si **calcola**
dal lemma stesso con un FNV-1a a 32 bit, identico in `strumenti/costruisci.py` e
in `js/corpus.js`. Quindi non c'e' nessun indice da scaricare, l'avvio pesa meno
di 300 KB, i blocchi arrivano mentre si scorre, e - siccome il numero di blocchi
e' fisso - **aggiungere voci non sposta mai quelle gia' pubblicate**: un
aggiornamento fa riscaricare solo i blocchi cambiati.

**La selezione del flusso.** Gli interessi dichiarati sono un'**inclinazione, non
un filtro**, e la differenza è tutto il prodotto. Nella prima versione il flusso
pesava i lemmi sugli interessi e prendeva i più pesanti: un profilo «medico»
riceveva così 450 parole mediche in un mese e **zero** lessico generale.
`scevro`, `prevaricare`, `zotico`, `riluttante` non arrivavano mai — cioè proprio
le parole per cui l'app esiste.

Ogni infornata si compone quindi per strati, con quote fisse:

| Strato | Quota | Cos'è |
|---|---:|---|
| I tuoi temi | 40% | Lavoro e interessi dichiarati |
| Lessico generale | 45% | Parole che non appartengono a nessun dominio |
| Il resto | 15% | Perché incontrare l'imprevisto è il punto |

Dentro ogni strato l'estrazione è **pesata, non ordinata** (chiave di
Efraimidis-Spirakis). Ordinare rifarebbe del peso un filtro un livello più in
basso: con migliaia di candidati, un lemma di peso 1 non entra mai fra i primi
venti se centinaia hanno peso 2,6. Così invece un peso doppio dà il doppio delle
probabilità, non la certezza. Venti aperture danno oltre 2.000 parole distinte,
non sempre le stesse sessanta.

Per questo il **30% delle voci senza dominio non è un difetto da correggere**:
`zotico`, `varcare`, `sussulto`, `supplicare` non appartengono davvero a nessun
campo, e forzarli in uno sarebbe peggio. Sono una categoria, e prendono la quota
più grande del flusso.

**Il controllo delle frasi** confronta la radice, non la forma esatta, così «ho blandito»
vale per `blandire`. I participi irregolari non si ricavano da nessuna regola meccanica
e stanno dichiarati nel corpus come radici alternative.

---

## Limiti, detti chiaramente

1. **Le notifiche non arrivano a app chiusa.** Senza un server con chiavi VAPID, il
   browser consegna solo mentre la scheda è aperta o da poco chiusa. `sw.js` ha già il
   gestore `push` pronto: manca solo il pezzo server.
2. **Non c'è sincronizzazione fra dispositivi.** Il backup si esporta e si importa a mano.
   È una conseguenza diretta del «niente email»: è un compromesso, non una svista.
3. **Le definizioni sono quelle del Wikizionario**, non di un dizionario
   professionale: la qualità varia, e qualche glossa resta goffa. Il filtro
   toglie le peggiori, non le rende buone. Vedi [FONTI.md](FONTI.md) per la
   licenza CC BY-SA, che è virale: chi ridistribuisce il corpus deve mantenerla.
4. **Il controllo delle frasi verifica che la parola ci sia, non che sia usata bene.**
   Distinguere l'uso corretto dal calco goffo richiede un modello linguistico.

## Passi successivi, in ordine di resa

1. Server minimo per Web Push: è ciò che trasforma i promemoria da promessa a funzione.
2. Riscrivere a mano le definizioni più goffe, partendo da quelle che compaiono
   di più: ogni voce riscritta esce dal vincolo CC BY-SA.
3. Valutazione automatica delle frasi scritte: da «contiene la parola» a «la usa bene».
4. Sincronizzazione legata al codice di ripristino, se si accetta un server.
