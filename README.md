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

## Le prove

```bash
node test/prova.js                                  # logica: corpus, SRS, account, flessione
NODE_PATH=$(npm root -g) node test/e2e.js           # interfaccia vera in Chromium + schermate
node test/icone.js                                  # rigenera le icone PWA
```

`test/e2e.js` vuole un server attivo sulla porta 8777 e Chromium; scrive le schermate
in `scatti/`. Le due suite insieme fanno 52 asserzioni e hanno già trovato quattro
difetti veri: la barra di navigazione che intercettava i tocchi da nascosta, la carta
del flusso che finiva sotto i pulsanti, le liste che sforavano lo schermo per via di un
track di griglia `auto`, e i participi irregolari (`eludere` → `eluso`) che il
riconoscimento per radice non copriva.

---

## Com'è fatta

```
index.html               guscio e ordine di caricamento
assets/styles.css        sistema visivo (variabili, componenti)
data/lemmi.js            134 lemmi italiani con definizione, esempio, sillabazione
js/store.js              stato e persistenza su localStorage, per nickname
js/srs.js                Leitner a 6 caselle, coda del flusso, confronto per radice
js/notify.js             promemoria lato client
js/ui.js                 utilità condivise (escape, foglio modale, brindisi)
js/views/*.js            una vista per schermata
js/app.js                instradamento via hash
sw.js                    guscio offline
```

**Il corpus.** 134 lemmi scelti nella fascia che interessa il prodotto: parole che un
italofono adulto riconosce ma raramente produce (`blandire`, `coacervo`, `surrettizio`,
`accidia`, `dirimente`). Ogni voce porta categoria grammaticale, sillabazione con accento
tonico, definizione, esempio d'uso, sinonimi, dominio e livello di rarità. I distrattori
del test a scelta multipla si generano a runtime pescando definizioni di lemmi dello
stesso dominio, così la scelta è difficile e non c'è da scriverli a mano.

**La selezione del flusso** pesa ogni lemma su mestiere e interessi dichiarati e sul
livello scelto, con un po' di rumore per non rendere l'ordine prevedibile.

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
3. **Il corpus è un seme, non un dizionario.** 134 lemmi bastano per qualche settimana
   d'uso, non per un anno.
4. **Il controllo delle frasi verifica che la parola ci sia, non che sia usata bene.**
   Distinguere l'uso corretto dal calco goffo richiede un modello linguistico.

## Passi successivi, in ordine di resa

1. Server minimo per Web Push: è ciò che trasforma i promemoria da promessa a funzione.
2. Ampliare il corpus a qualche migliaio di lemmi, con provenienza dichiarata.
3. Valutazione automatica delle frasi scritte: da «contiene la parola» a «la usa bene».
4. Sincronizzazione legata al codice di ripristino, se si accetta un server.
