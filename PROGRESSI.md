# PROGRESSI

Diario di lavorazione del backlog in [PIANO.md](PIANO.md). Un blocco per
commit, in ordine cronologico. Ogni blocco dice cosa è stato fatto, come è
stato verificato, e cosa resta aperto.

**Base di partenza** (2026-09-19, `d1c63ea`)
`test/prova.js` 81 asserzioni · `test/e2e.js` 63 · entrambe verdi.
Corpus 13.589 voci. Nessuna prova sui dati pubblicati, nessuna sui documenti.

**Adesso**
`test/prova.js` 131 · `test/dati.js` 37 · `test/documenti.js` 15 ·
`test/e2e.js` 94 — **277 asserzioni, tutte verdi**, eseguite a ogni spinta da
`.github/workflows/prove.yml`. `eslint .` pulito.

---

## 1 · Punto d'ingresso alle prove e al linter — `203a63d`
*Piano: voce 10*

`package.json` con `npm test`, `npm run lint`, `npm run test:e2e`,
`npm run servi`, senza aggiungere dipendenze a runtime. `eslint.config.mjs`
versionata, con i tre ambienti che convivono nel repository (pagina, service
worker, prove in Node) e solo regole che trovano difetti, non di stile.
`strumenti/__pycache__` tolto dal tracciamento.

**Verificato**: `eslint .` → 0 errori, 2 avvisi (codice morto reale, poi
rimosso nel blocco 11).

---

## 2 · I dati pubblicati tornano coerenti con la pipeline — `daea41c`
*Piano: voci 2 e 7. Riscrittura dei blocchi autorizzata dall'utente.*

Cercando i 5 casi di markup residuo che il README dichiarava risolti ne è
emerso uno più grosso: **il taglio a 260 e 200 caratteri spezzava l'ultima
parola a metà**, e il punto aggiunto da `tipografia()` travestiva il monco da
frase intera. 112 definizioni e 17 esempi.

- Pipeline: `taglia()` in `estrai.py` taglia su un confine di frase o almeno
  di parola; `pulisci()` scioglie i collegamenti esterni `[url etichetta]`,
  toglie le quadre singole e lo spazio appeso davanti alla punteggiatura.
- Dati: `strumenti/ripara.py` applica alle sole voci difettose le stesse
  funzioni della pipeline. Non rigenera dal dump. `--controlla` esce 1.
- Applicate: 112 definizioni e 17 esempi troncati, 13 con markup, 13 con
  parentesi spaiate, 60 con spazi davanti alla punteggiatura. 61 blocchi su
  64. Il conteggio delle voci non cambia.
- `test/dati.js`: 27 asserzioni sul corpus intero.

**Verificato**: rimesso un solo blocco alla versione precedente, tre
asserzioni diventano rosse. Lo strumento converge in una passata.

---

## 3 · Il campo `curato` torna nei dati — `59fbbdc`
*Piano: voce 5*

`costruisci.py` non lo esportava: zero occorrenze su 13.589 record. La scheda
lo cercava per di più sul record dell'utente invece che sulla voce. La nota
CC BY-SA compariva quindi anche sotto le 134 definizioni scritte per Readda,
e `FONTI.md` dichiarava un campo inesistente. Corretto nei tre punti.

---

## 4 · Cirillico nella pipeline, e la guardia spostata — `9080099`
*Piano: voci 4 e 9*

La regex del dominio `lavoro` conteneva «denar» con tre lettere cirilliche:
non ha mai corrisposto a niente. **75 voci parlano di denaro, 31 finite in un
dominio diverso.** La prova che sorveglia questa classe di difetto non l'ha
vista per due motivi suoi: l'elenco dei file era scritto a mano e conteneva
solo i `.js` dell'app, e toglieva le stringhe prima di cercare. Adesso
l'elenco si ricava dalle cartelle e la ricerca copre tutto il testo.

**Verificato**: scritta la prova con l'esempio cirillico nel proprio
commento, ha segnalato se stessa.

---

## 5 · Il controllo delle frasi riconosce i verbi irregolari — `1fcdd31`
*Piano: voce 1 — la più importante del backlog*

«Gli hanno imposto il silenzio» veniva respinto con «Manca la parola». La
radice di `imporre` è `imporr`, e «imposto» non la contiene. Il campo `forme`
del corpus copriva 5 voci su 13.589, contro 2.572 verbi.

Ventotto famiglie irregolari, dichiarate come «fine dell'infinito → temi che
la sostituiscono», coprono 336 verbi. Due dettagli costati più del resto: i
riflessivi (`opporsi` viene da `opporre`, non da `oppore`) e i temi corti
(`contrarre` meno `trarre` più `tra` fa `contra`, che nel corpus prende 36
lemmi).

**Misurato**: esempi che non contengono il proprio lemma da 16 a 6, e i sei
rimasti sono errori di battitura della fonte. Lemmi catturati per sbaglio dai
temi derivati: 319, in larga parte parenti veri. 2.000 controlli in 25 ms.
Otto casi che devono restare **rifiutati** sono nella prova, perché la
correzione non scivoli nell'eccesso opposto.

---

## 6 · La pipeline usa le stesse famiglie — `e433dcd`
*Piano: voce 22*

`esempio_valido()` scartava «Il soldato ritrasse la pistola» da «ritrarre», e
la carta restava senza esempio. Le famiglie stanno ora in
`strumenti/flessione.py`, e `test/dati.js` confronta le due implementazioni
su tutti i 13.589 lemmi.

**Verificato**: tolto un tema da una sola delle due, cinque lemmi divergono.

---

## 7 · Un backup malformato non fa più saltare l'app — `205adc0`
*Piano: voce 3*

`importa()` leggeva `profilo.nick.toLowerCase()` senza controllare `nick`:
TypeError e schermata bianca invece di «codice non valido». Stesso problema
in altra forma su `p.usi`, di cui solo una vista su tre si difendeva.
`normalizzaStato()` garantisce ora la forma dell'account al caricamento, in
un posto solo. Nove asserzioni nuove.

---

## 8 · La striscia sopravvive al cambio dell'ora — `7a3279a`
*Piano: voce 6*

«Ieri» era `Date.now() - 864e5`, sbagliato in entrambe le direzioni ai
passaggi d'ora. La prova costruisce il calendario con numeri interi e
controlla un invariante su 900 giorni e tre orari.

**Verificato**: col calcolo vecchio fallisce in Europe/Rome, Europe/London e
America/Santiago, con le date esatte.

---

## 9 · La dose giornaliera smette di essere un ornamento — `6991632`
*Piano: voce 16. Comportamento scelto dall'utente: fermarsi con un'uscita.*

Contava anche la cosa sbagliata: `fatteOggi()` somma i ripassi, e la barra
saliva stando fermi nel ripasso. Aggiunto `nuoveOggi()`. Raggiunta la dose il
flusso si ferma e propone il ripasso, con un'uscita esplicita valida per la
giornata. Sette asserzioni end-to-end sui due rami.

---

## 10 · La scelta multipla non può avere due risposte identiche — `20371e9`
*Piano: voci 21 e 23*

38 definizioni stanno su due voci diverse: escludere il solo identificatore
non bastava. Nella stessa passata, tre cose visibili sulla carta: «Non
ancora.» seguito dal vuoto quando l'esempio manca (tre voci su quattro), le
scelte multiple con meno di tre distrattori, e «altro» minuscolo nella
testata di Io.

**Nota su come è andata**: la prima prova che ho scritto era teatro — su
13.589 voci la gemella esce fra le prime tre una volta su quattromila, e
passava anche col codice vecchio. Quella vera usa un corpus finto di cinque
voci: col criterio precedente fallisce 300 volte su 300.

---

## 11 · Tastiera e lettori di schermo — `5b872d0`
*Piano: voci 19, 20, 21*

`:focus-visible` su tutti i comandi: l'app si guida con 1, 2 e 3 e non si
vedeva dove si era. `#pila` diventa una regione viva, e sparisce dalla
lettura la decorazione — carta dietro, timbri del trascinamento,
sillabazione. Otto asserzioni end-to-end.

---

## 12 · Due impostazioni dichiarate e mai applicate — `b1d4afc`
*Piano: voci 17 e 18*

`oraPromemoria` era salvata e non la leggeva nessuno: il controllo partiva
ogni cinque minuti dalla mattina alla notte. Adesso la finestra è di due ore
dall'orario scelto, scavalcando la mezzanotte, e il promemoria è uno al
giorno. `artefatto.py` conteneva una sostituzione che rimpiazzava una stringa
con se stessa sotto un commento che diceva di spegnere il service worker.

---

## 13 · I documenti tornano ai numeri veri — `9402aeb`
*Piano: voci 11, 12, 13, 14*

`FONTI.md` dichiarava 11.326 voci, 11.192 dal Wikizionario, 33 esplicite,
1,4%. Il manifesto: 13.589, 13.455, 46, 1,7%. `test/documenti.js` legge il
manifesto e verifica conteggi, percentuali, ogni numero col separatore delle
migliaia seguito da «voci», gli `npm run` citati e i file nominati nei
comandi.

---

## 14 · Codice di ripristino e foglio modale — `bb95530`
*Piano: voci 26 e 27, più una scoperta*

Il codice di ripristino viene da `crypto.getRandomValues`. Il foglio modale
si chiude con Esc, si dichiara `role="dialog"`, e il fuoco torna dov'era.

**Nota su come è andata**: anche qui la prima asserzione sul fuoco non
provava niente (si riduceva a «il velo non c'è più»). Quella vera apre il
foglio da tastiera e controlla che il fuoco torni sulla voce esatta.

---

## 15 · Difetti trovati rileggendo il proprio lavoro — `2cf787e`

Una rilettura avversariale dell'intero diff ha trovato tredici cose, dieci
delle quali reali. Le sei di comportamento, in ordine di gravità:

- **I tasti restavano attivi sulla schermata di pausa** (mio, del blocco 9).
  Uno spazio giudicava la parola successiva — mai vista, ma salvata — e
  `preventDefault()` impediva al bottone sotto il fuoco di azionarsi: chi usa
  la tastiera restava chiuso dentro perdendo una parola per tentativo.
- `pausa()` e `finito()` nascondono i tre bottoni, e solo l'uscita dalla
  pausa li rimetteva: un rifornimento tardivo mostrava una carta senza azioni.
- I distrattori pescavano anche fra le voci esplicite, rompendo la promessa
  dell'interruttore proprio dove non te l'aspetti. Misurate: 2 su 900.
- Saltare una scelta multipla con meno di quattro opzioni lasciava `prox` nel
  passato: voce scaduta per sempre, pallino sempre acceso, promemoria ogni
  giorno su una parola che il ripasso rifiutava di mostrare.
- `nomeDominio()` leggeva il prototipo e chiamava `charAt` su qualunque cosa.
- `controlla()` segnava il promemoria anche quando la notifica non partiva.
- `importa()` validava il nickname ripulito e ne salvava un altro.

---

## 16 · Il giro sul fuoco da tastiera — `48bf1fa`

Tre difetti nel lavoro del blocco 11. La regola `:focus-visible` imponeva
`border-radius:4px` a tutto (stessa specificità di `.btn` e `.filtro`, e
viene dopo): la pillola della dose diventava un quadrato. Il foglio si
dichiarava `aria-modal` senza trattenere il tab. Il fuoco tornava al punto di
partenza mentre il velo era ancora sullo schermo, e anche quando il nodo non
esisteva più.

---

## 17 · L'invariante del taglio diventa assoluta — `1ea550e`

Due componenti riconoscono un troncamento vecchio dalla sola lunghezza, e la
firma vale solo se la pipeline non può più produrla. Non era così:
`chiudi_taglio()` aveva un ramo che restituiva il taglio grezzo, e `taglia()`
lasciava passare un testo lungo esattamente quanto il tetto.

`python3 strumenti/estrai.py --autoprova` verifica l'invariante su 18.036
casi, e `test/dati.js` lo esegue.

---

## 18 · Il guscio offline e le schermate — `18f1f30`

`sw.js` elenca a mano i file da mettere in cache: dimenticarsene non rompe
niente finché c'è rete, si scopre in aereo. Due asserzioni lo confrontano con
gli script di `index.html`.

---

## 19 · Il contrasto, misurato invece che stimato — `ef98885`

`--inchiostro-3` era al 40%, cioè 3,0:1 sul fondo delle carte — sotto il
4,5:1 che serve al testo normale, ed è il livello con cui sono scritte tutte
le note piccole, attribuzione della licenza compresa. Portato a .58, il
minimo che regge su tutti e cinque i fondi.

E la riga che spiega le scorciatoie da tastiera era scritta in
`--inchiostro-4`, che sta all'1,6:1: fra tutti i testi da rendere invisibili
in un'app che si guida con 1, 2 e 3, la peggiore.

---

## 20 · Le prove girano da sole — `c214bb2`

Tutto il lavoro dei blocchi precedenti dipendeva dal fatto che qualcuno si
ricordasse di lanciare `npm test`, cioè esattamente il meccanismo che aveva
lasciato passare i difetti che quelle suite ora sorvegliano. Una guardia che
va accesa a mano non è una guardia.

`.github/workflows/prove.yml`: tre lavori separati — logica, linter,
interfaccia in Chromium — perché falliscono per ragioni diverse. Gli
strumenti che servono solo alle prove si installano con `--no-save`, così il
progetto continua a non dichiarare dipendenze, e i passi eseguono gli stessi
comandi scritti nel README invece di loro varianti.

Due cose che senza questo non si sarebbero viste:

- `test/e2e.js` aveva il percorso di Chromium scritto a mano
  (`/opt/pw-browsers/chromium-1194/…`), valido solo sulla macchina dove era
  stato scritto: altrove la prova non partiva. Ora prova la variabile
  `CHROME`, poi quel percorso se esiste, poi lascia cercare a Playwright.
- `ripara.py --controlla` non lo chiamava nessuna prova. Diceva se i blocchi
  pubblicati sono allineati a quello che la pipeline produce oggi — cioè
  esattamente il disallineamento da cui è partita questa sessione — e lo
  diceva solo a chi lo eseguiva. Ora lo chiama `test/dati.js`.

**Prima corsa: sei check verdi** (logica 8 s, linter 12 s, Chromium 60 s).
Sei e non tre perché `on: [push, pull_request]` fa partire tutto due volte su
un ramo con una richiesta aperta: corretto subito dopo limitando `push` al
solo ramo predefinito.

---

## 21 · Ho diagnosticato un guasto che non c'era — `5c0ba2a`, corretto in `9b7e55d`

Merita di stare scritto perché è l'errore più insidioso della sessione.

Dopo aver messo in piedi l'integrazione continua, ho letto lo stato dei
controlli con `get_check_runs` e ho visto il lavoro in Chromium fermo su
*in progress* per sette minuti, contro i sessanta secondi della corsa
precedente con gli stessi identici passi. Ho concluso che si fosse piantato,
ho incolpato il processo in secondo piano che tiene aperta l'uscita del
passo — un tranello reale e classico di GitHub Actions — e ho spinto una
correzione dicendolo nel messaggio di commit e in un commento del workflow.

**Non era mai successo niente.** Interrogando i lavori uno per uno con
`get_workflow_job`, che restituisce anche l'elenco dei passi, il lavoro
risultava completato con successo alle 20:49:34, sessanta secondi tondi, e
il passo «Servi e prova» era durato trenta secondi. A essere ferma era la
lettura: `get_check_runs` e lo stato a livello di corsa continuano a
riportare *in progress* per minuti dopo la fine. Me ne sono accorto quando
anche i due lavori veloci — che non hanno nessun processo in secondo piano —
sono risultati bloccati insieme: tre blocchi simultanei con cause diverse non
esistono.

Cosa resta: le modifiche sono buone pratiche e restano, ma **preventive, non
correttive**, e il commento nel workflow che diceva «è successo» ora dice il
contrario. Una cosa vera l'ho trovata inseguendo il fantasma: la prima
versione della correzione chiudeva l'involucro `npx` invece del server, che
restava vivo — l'ho visto sondando la porta dopo l'uscita dello script.

Per la prossima volta: **lo stato dei controlli va letto dai singoli lavori,
non dal riepilogo.** Il riepilogo mente per qualche minuto, e con la postura
«CI rossa è lavoro adesso» una bugia di qualche minuto basta a far inseguire
un guasto inesistente.

---

## Due volte ho scritto prove che non provavano niente

Vale la pena scriverlo perché è il modo più facile di illudersi di aver
verificato qualcosa.

La prima sui distrattori: su 13.589 voci la gemella esce fra le prime tre una
volta su quattromila, quindi l'asserzione passava anche con il codice
difettoso. Rifatta su un corpus finto di cinque voci, dove la gemella esce per
forza: col criterio vecchio fallisce 300 volte su 300.

La seconda sul fuoco del foglio modale: la condizione si riduceva a «il velo
non c'è più». Rifatta aprendo il foglio da tastiera e controllando che il
fuoco torni sulla voce esatta.

Da lì in poi ogni prova nuova è stata verificata rimettendo il difetto e
guardandola diventare rossa. Dove non l'ho fatto, il commit non lo dice.

---

## Decisioni prese e non fatte

**Le 31 voci che hanno perso il dominio `lavoro`** non sono state
riassegnate. Nei dati pubblicati non si distingue un dominio letto dai
marcatori del Wikizionario da uno dedotto, quindi rieseguire l'inferenza
significherebbe indovinare. E `lavoro` non è fra i domini «larghi»: una voce
che oggi sta in `generale` e ricevesse `lavoro` uscirebbe dallo strato
generale del flusso. È un cambio di comportamento guidato da un'euristica non
verificabile. Si sistema alla prossima esecuzione di `aggiorna.py`, ed è
scritto nei passi successivi del README.

**`data/storico.json` è rimasto com'è**, con due righe che dicono 11.326
mentre il corpus ne ha 13.589. È il registro delle esecuzioni di
`aggiorna.py`, e quelle due esecuzioni sono avvenute davvero: il corpus è poi
cresciuto con una chiamata diretta a `costruisci.py`, fuori dal ciclo.
Inventare una riga per far tornare i conti sarebbe peggio del disallineamento.

**Gli esempi scartati dalle versioni precedenti** per via delle forme
irregolari non si recuperano: non sono nei dati pubblicati, sono rimasti nel
dump. Tornano alla prossima esecuzione della pipeline.

**28 testi di lunghezza esattamente pari al tetto** restano ambigui: il
taglio può esserci stato, ma finiscono con un punto loro e si leggono.
`ripara.py` li conta e non li tocca, perché ripararli alla cieca
accorcerebbe anche le definizioni che quella lunghezza ce l'hanno per davvero.

**Niente subagenti in parallelo**, nonostante la richiesta lo prevedesse: le
attività rimaste condividono le suite di prova e la porta 8777 del server
locale, e due esecuzioni di `test/e2e.js` insieme si pestano i piedi. Il
coordinamento sarebbe costato più del tempo risparmiato.

---

## Problemi aperti

- Le 31 voci del dominio `lavoro` (sopra).
- I 6 esempi che non contengono il proprio lemma sono errori di battitura
  nella fonte (`Allineamernto`, `allestimemto`, `meningococo`): si correggono
  a mano in `curati.js` o si aspetta che il Wikizionario li sistemi.
- 309 definizioni sotto i 25 caratteri: da guardare se il punteggio di scheda
  dovrebbe scartarle invece di limitarsi a ordinarle. Voce 24 del piano, mai
  affrontata.
- Le notifiche restano senza server: è il primo dei passi successivi, e
  cambia la natura del progetto.
