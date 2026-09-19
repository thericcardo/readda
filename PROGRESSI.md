# PROGRESSI

Diario di lavorazione del backlog in [PIANO.md](PIANO.md). Un blocco per
commit, in ordine cronologico. Ogni blocco dice cosa è stato fatto, come è
stato verificato, e cosa resta aperto.

**Base di partenza** (2026-09-19, `d1c63ea`): `test/prova.js` 81 asserzioni,
`test/e2e.js` 63, entrambe verdi. Corpus 13.589 voci.

**Adesso**: `test/prova.js` 83 · `test/dati.js` 30 · `test/e2e.js` 63 — verdi.

---

## 1 · Punto d'ingresso alle prove e al linter — `203a63d`
*Piano: voce 10*

- `package.json` con `npm test` (logica + dati), `npm run lint`, `npm run e2e`,
  `npm run servi`. Nessuna dipendenza a runtime aggiunta.
- `eslint.config.mjs` versionata, con i tre ambienti che convivono nel
  repository (pagina, service worker, prove in Node). Solo regole che trovano
  difetti, nessuna regola di stile.
- `strumenti/__pycache__` tolto dal tracciamento e ignorato.

**Verificato**: `eslint .` → 0 errori, 2 avvisi (codice morto reale, voce 26).

**Nota**: `npm run lint` usa l'eslint disponibile nel `PATH` o via `npx`. Non
è una dipendenza dichiarata di proposito — il progetto resta senza
`node_modules`.

---

## 2 · I dati pubblicati tornano coerenti con la pipeline — `daea41c`
*Piano: voci 2 e 7. Autorizzata dall'utente la riscrittura dei blocchi.*

Cercando i 5 casi di markup residuo dichiarati risolti nel README (e presenti
nei dati) ne è emerso uno più grosso: **il taglio a 260 e 200 caratteri
spezzava l'ultima parola a metà**, e il punto aggiunto da `tipografia()`
travestiva il monco da frase intera. 112 definizioni e 17 esempi.

Pipeline:
- `taglia()` in `estrai.py` taglia su un confine di frase, o almeno di parola,
  e in quel caso chiude con i puntini. Vale anche per l'etimologia (stesso
  difetto, tetto 180).
- `pulisci()` scioglie i collegamenti esterni `[url etichetta]`, toglie le
  quadre singole rimaste e lo spazio appeso davanti alla punteggiatura.

Dati: `strumenti/ripara.py` applica alle sole voci difettose le stesse
funzioni della pipeline. Non rigenera dal dump. `--controlla` esce 1 se c'è da
riparare.

Applicate: 112 definizioni e 17 esempi troncati, 13 con markup, 13 con
parentesi spaiate, 60 con spazi davanti alla punteggiatura. 61 blocchi su 64.
Il conteggio delle voci non cambia.

`test/dati.js`: 27 asserzioni sul corpus intero.

**Verificato**: rimesso un solo blocco alla versione precedente, tre
asserzioni diventano rosse. `ripara.py --controlla` esce 0 dopo
l'applicazione (converge in una passata).

**Aperto**: 28 testi lunghi esattamente quanto il tetto restano ambigui — il
taglio può esserci stato, ma finiscono con un punto loro e si leggono. Lo
strumento li conta e non li tocca.

---

## 3 · Il campo `curato` torna nei dati — `59fbbdc`
*Piano: voce 5*

`costruisci.py` non esportava `curato`: zero occorrenze su 13.589 record. La
scheda di dettaglio lo cercava per di più sul record dell'utente invece che
sulla voce. Risultato: la nota CC BY-SA compariva anche sotto le 134
definizioni scritte per Readda, e `FONTI.md` dichiarava un campo inesistente.

Corretto in tutti e tre i punti. Tre asserzioni nuove in `test/dati.js`.

---

## 4 · Cirillico nella pipeline, e la guardia spostata — `9080099`
*Piano: voci 4 e 9*

La regex del dominio `lavoro` conteneva «denar» scritto con tre lettere
cirilliche: non ha mai corrisposto a niente. **75 voci parlano di denaro, 31
delle quali sono finite in un dominio diverso o in «generale».**

La prova che sorveglia questa classe di difetto non l'ha visto per due motivi,
entrambi suoi: l'elenco dei file era scritto a mano e conteneva solo i `.js`
dell'app; e toglieva le stringhe prima di cercare, mentre il cirillico stava
dentro una stringa.

Adesso l'elenco si ricava dalle cartelle e la ricerca copre tutto il testo.
Aggiunta una terza asserzione: nessun file in forma decomposta.

**Verificato**: scritta la prova con l'esempio cirillico dentro il proprio
commento, ha segnalato se stessa.

---

## Problemi aperti

- Le 31 voci che hanno perso il dominio `lavoro` **non sono state
  riassegnate**: farlo richiede rieseguire `inferisci_dominio` sui dati
  pubblicati, e il dominio influenza la selezione del flusso. Da valutare come
  attività a sé.
- 28 testi di lunghezza ambigua (vedi blocco 2).
