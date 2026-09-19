# PIANO — backlog di lavoro

Stato di partenza misurato il 2026-09-19 su `claude/great-wright-w81zl9`.
Base verde: `node test/prova.js` → 81 asserzioni, `node test/e2e.js` → 63. Nessuna fallita.
Corpus pubblicato: 13.589 voci in 64 blocchi, 46 segnate `sens`, 134 curate a mano.

---

## Stato di questo piano

Lavorazione in [PROGRESSI.md](PROGRESSI.md), un blocco per commit.

| Fascia | Voci | Fatte | Note |
|---|---|---|---|
| 1 — il prodotto non fa quello che dichiara | 1-6 | **6 / 6** | |
| 2 — le prove che mancano | 7-10 | **4 / 4** | |
| 3 — la documentazione contraddice il codice | 11-15 | **4 / 5** | la 15 (`storico.json`) chiusa con una decisione, non con una modifica |
| 4 — funzioni dichiarate e non implementate | 16-18 | **3 / 3** | |
| 5 — interfaccia e accessibilità | 19-21 | **3 / 3** | più il contrasto e il foglio modale, scoperti strada facendo |
| 6 — qualità dei dati | 22-24 | **2 / 3** | la 24 resta: cambiare i filtri si valida solo rieseguendo la pipeline sul dump |
| 7 — piccoli debiti | 25-28 | **3 / 4** | la 28 (formato data) resta: valore basso, richiede una migrazione |

Scoperte durante la lavorazione e chiuse: il taglio a metà parola (112
definizioni e 17 esempi), i tasti attivi sulla schermata di pausa, i
distrattori che pescavano lessico esplicito, il ripasso che lasciava una voce
scaduta per sempre, `nomeDominio()` sul prototipo, il promemoria segnato anche
quando non partiva, il nickname salvato con gli spazi, il contorno del fuoco
che squadrava le pillole, il foglio modale senza trappola per il tab, il
contrasto sotto la soglia, il guscio offline senza guardia.

Le tre voci che restano sono spiegate in fondo a PROGRESSI.md: due valgono
poco rispetto al rischio, una si può validare solo con il dump alla mano.

L'ordine è per rapporto valore/sforzo, non per gravità. Le voci marcate
**[misurato]** sono state riprodotte durante la ricognizione; le altre sono
lette dal sorgente e vanno confermate in fase di lavorazione.

---

## Fascia 1 — il prodotto non fa quello che dichiara

### 1. Il controllo delle frasi rifiuta i verbi irregolari **[misurato]**
Il cuore dell'app è «scrivi una frase vera con questa parola». `Srs.contiene()`
confronta la radice ricavata meccanicamente dall'infinito, e le famiglie
irregolari italiane non si ricavano così: `radice('supporre')` restituisce
`supporr`, quindi *«Gli hanno imposto il silenzio»* viene respinto con «Manca la
parola». Riprodotto su `supporre`, `imporre`, `ritrarre`, `ridurre`,
`persuadere`. Funziona solo dove il participio è dichiarato a mano: nel corpus
`forme` esiste su **5 voci su 13.589**, tutte curate.
- **Perché conta**: è l'unico punto in cui l'utente produce lavoro vero, e
  l'app gli dice che ha sbagliato quando ha ragione. Verbi nel corpus: 2.572;
  famiglie strutturalmente rotte `-orre/-urre/-arre` 56, più la gran parte dei
  351 in `-ere`.
- **Fatto quando**: una tabella di casi reali per ogni famiglia irregolare passa,
  e una misura di falsi positivi su tutto il corpus resta sotto una soglia
  dichiarata nel test (una frase che *non* contiene la parola non deve passare).
- **Rischio**: allargare le radici aumenta i falsi accetti. Va misurato, non
  supposto: il test deve contare entrambe le direzioni.

### 2. Dati pubblicati non rigenerati dopo la correzione della pipeline **[misurato]**
Il README elenca fra i difetti corretti «5 definizioni con markup wiki
sopravvissuto (`attaccate]].`)». Il codice di `estrai.py` oggi lo pulisce
davvero — ma i blocchi in `data/` sono quelli di prima: `oliva`, `ambra`,
`suggestionabile`, `quadrilatero`, `terrone` mostrano ancora `[[` e `]]` sulla
carta. In più 12 definizioni hanno parentesi tonde spaiate (`squartare: (di
bestie)) fare a pezzi.`).
- **Perché conta**: sono 17 carte visibilmente rotte, e il README dichiara il
  contrario. La correzione in pipeline senza rigenerazione dei dati è un
  fallimento silenzioso che si ripeterà.
- **Fatto quando**: uno strumento di riparazione deterministico e versionato
  ripulisce i blocchi, i test sui dati falliscono se il markup torna, e il
  README smette di dichiarare risolto ciò che non lo è.
- **Rischio**: riscrivere 4 MB di dati generati. Va fatto con uno script che
  tocca solo i campi difettosi e stampa esattamente cosa cambia.

### 3. Crash su account importati o legacy **[misurato]**
Due difetti dello stesso tipo:
`Store.importa()` non valida `pacco.dati.profilo.nick` e lancia
`TypeError: Cannot read properties of undefined` su un backup manomesso o di
formato vecchio — l'app resta bianca invece di dire «codice non valido».
`ripasso.js:108` e `io.js:14` leggono `p.usi.length` senza difese: qualunque
record di parola privo di `usi` (importato, o scritto da una versione futura)
fa saltare la schermata. `collezione.js` la difesa ce l'ha, quindi il codice già
sa che il caso esiste.
- **Perché conta**: il backup è l'unica rete di sicurezza di un'app senza
  server. Se il ripristino può rompere l'app, la rete non c'è.
- **Fatto quando**: `importa` rifiuta con un messaggio ogni pacco malformato;
  esiste un punto solo che normalizza un record di parola, e le viste lo usano.
- **Rischio**: basso.

### 4. Lettere cirilliche dentro la pipeline Python **[misurato]**
`strumenti/costruisci.py:32`, regex del dominio `lavoro`: fra le alternative c'è
`денa` — «ден» in cirillico. Era `denar(o)`. Il risultato è che «denaro» non
contribuisce mai al dominio `lavoro`. Il test di igiene del sorgente cerca
esattamente questa classe di difetto, ma la sua lista di file contiene solo i
`.js`.
- **Perché conta**: è lo stesso difetto che il README celebra di aver trovato e
  corretto, sopravvissuto nel file che *genera il corpus*. E la guardia esiste
  già: le manca solo la copertura.
- **Fatto quando**: la regex è latina, il test di igiene copre `strumenti/*.py`
  e fallisce se il carattere torna.
- **Rischio**: nullo.

### 5. `curato` non arriva mai al client **[misurato]**
`costruisci.py:359` non elenca `curato` fra i campi esportati: nei 13.589 record
pubblicati il campo è presente **zero volte**. `collezione.js:286` poi lo cerca
sul record dell'utente (`p.curato`) invece che sulla voce (`l.curato`). Due
difetti indipendenti che puntano nella stessa direzione: la nota «Definizione dal
Wikizionario, CC BY-SA 3.0» compare anche sulle 134 voci scritte a mano.
`FONTI.md` afferma che quelle voci «portano il campo `curato`»: non è vero.
- **Perché conta**: attribuire a una fonte esterna un testo proprio è
  un'imprecisione di licenza in entrambe le direzioni, ed è l'unica frase
  legale che l'utente legge.
- **Fatto quando**: `curato` è nei blocchi, la nota compare solo dove serve, un
  test lo verifica sui dati pubblicati.
- **Rischio**: comporta la rigenerazione dei blocchi — si accorpa alla voce 2.

### 6. La striscia di giorni si azzera al cambio dell'ora legale **[misurato]**
`store.js` calcola «ieri» con `Date.now() - 864e5`. Il giorno dopo il passaggio
all'ora legale, fra mezzanotte e l'una, quel calcolo torna indietro di due
giorni: `2025-03-31 00:30` → «ieri» = `2025-3-29`. La striscia riparte da 1.
- **Perché conta**: la striscia è uno dei tre numeri della schermata *Io*.
  Perderla per un difetto di calendario è esattamente il genere di cosa che fa
  smettere di aprire l'app.
- **Fatto quando**: il calcolo passa per l'aritmetica di calendario e un test
  con `TZ=Europe/Rome` copre entrambi i passaggi d'ora.
- **Rischio**: basso. Il formato salvato non va cambiato (vedi voce 22).

---

## Fascia 2 — le prove che mancano

### 7. Nessuna prova sui dati pubblicati
Le due suite provano la logica e l'interfaccia; i 4 MB di `data/` non li guarda
nessuno. È il motivo per cui le voci 2 e 5 sono passate inosservate.
- **Fatto quando**: `test/dati.js` controlla su tutti i 64 blocchi: markup
  residuo, parentesi e caporali spaiate, campi obbligatori, coerenza
  sillabazione/lemma, unicità degli id, corrispondenza fra ogni voce e il blocco
  che il suo hash indica, e coerenza fra i conteggi del manifesto e i dati.
- **Rischio**: la suite dev'essere veloce, o nessuno la esegue.

### 8. Parità dell'hash fra Python e JavaScript
`blocco_di()` in Python e `blocco()` in JS devono restare identiche: se
divergono, i lemmi non si trovano più e il difetto è silenzioso. Il commento lo
dice in entrambi i file; nessun test lo verifica.
- **Fatto quando**: un test confronta le due implementazioni sull'intero corpus.

### 9. Igiene del sorgente estesa ai file Python
Vedi voce 4. La lista dei file nel test è scritta a mano: va ricavata dalla
cartella, così un file nuovo è coperto dal giorno in cui nasce.

### 10. `package.json` e configurazione del linter versionata
Non esiste un punto d'ingresso: chi arriva deve leggere il README per sapere
come si eseguono le prove. Nessuna dipendenza a runtime, solo `scripts`.
- **Fatto quando**: `npm test` esegue logica + dati, `npm run lint` passa pulito
  sui file dell'app.

---

## Fascia 3 — la documentazione contraddice il codice

### 11. `FONTI.md` è fermo a due generazioni fa **[misurato]**
Dichiara 11.326 voci, 11.192 dal Wikizionario, 33 esplicite, «l'1,4% di 782.769
pagine». I dati dicono 13.589 / 13.455 / 46 / 1,7%.

### 12. `README.md` porta numeri misti **[misurato]**
«33 voci (lo 0,29%)» contro le 46 reali; «142 asserzioni» contro 144; fra i
domini «larghi» elenca *società*, che non esiste: nel codice la voce è
`politica`.

### 13. Commenti di `srs.js` fermi alla versione precedente **[misurato]**
Il blocco sopra `QUOTE` parla ancora di «3.419 voci» e «undici mesi», mentre il
README (e la misura) dicono 8.660 e 783 giorni. Il commento è la fonte che legge
chi modifica il codice: è quello che conta di più.

### 14. Una guardia, non una correzione una tantum
Le voci 11–13 torneranno. Serve un test che estragga i numeri dai documenti e li
confronti con `data/manifesto.js`.

### 15. `data/storico.json` fermo a 11.326 **[misurato]**
Due righe con `prima: 11326, dopo: 11326` per un corpus che ne ha 13.589: lo
storico non è stato aggiornato dall'ultima ricostruzione.

---

## Fascia 4 — funzioni dichiarate e non implementate

### 16. La «dose giornaliera» è decorativa **[misurato]**
*Io* la presenta come «quante parole nuove al giorno», il flusso ne disegna la
barra di avanzamento — e poi non succede niente: la barra supera il 100% e il
flusso continua. È una promessa di prodotto non mantenuta, ed è anche la scelta
più discutibile del piano, perché fermare il flusso è una decisione di prodotto,
non un difetto. Da decidere insieme prima di implementare.
- **Fatto quando**: raggiunta la dose il flusso propone di fermarsi, con la
  possibilità esplicita di continuare; il test e2e copre entrambi i rami.

### 17. `oraPromemoria` salvata e mai letta **[misurato]**
`store.js:31` inizializza `oraPromemoria: 20`. Nessuno la legge, e l'interfaccia
non la mostra. O la si usa (il controllo periodico la rispetta) o si toglie.

### 18. `artefatto.py` contiene una sostituzione nulla **[misurato]**
Righe 34-35: `corpo.replace(X, X)`. Il commento dice che dentro l'artefatto il
service worker non ha senso; la riga non fa niente, e `app.js` lo registra
comunque. O si rimuove la registrazione nella pagina generata, o si toglie il
finto intervento e si cambia il commento.

---

## Fascia 5 — interfaccia e accessibilità

### 19. Nessun `:focus-visible` sui pulsanti
L'unico stile di fuoco è su `.campo`. L'app si guida da tastiera (1/2/3 nel
flusso), ma chi la usa così non vede mai dove si trova.

### 20. Il flusso non annuncia la carta nuova
La pila si riscrive via `innerHTML` senza regione viva: per un lettore di
schermo il contenuto cambia in silenzio.

### 21. Testi vuoti resi come vuoti **[misurato]**
Su risposta sbagliata il ripasso stampa «Non ancora.» seguito dall'esempio —
assente su 10.228 voci su 13.589, quindi nella maggioranza dei casi non segue
niente. Stessa cosa per il `<p class="esempio">` vuoto nella carta del flusso e
per `nomeDominio('altro')`, che nella testata di *Io* stampa «altro» minuscolo.

---

## Fascia 6 — qualità dei dati

### 22. 16 esempi non contengono il lemma **[misurato]**
`sottoporsi`, `predisporre`, `opporsi`, `ritrarre`, `detrarre`, `deporre`…
Stessa causa della voce 1: `esempio_valido()` in `costruisci.py` usa la stessa
radice meccanica. Si recuperano tutti con le forme derivate — è la stessa
correzione applicata dall'altro lato della pipeline.

### 23. 38 definizioni duplicate fra voci diverse **[misurato]**
76 voci coinvolte. `Srs.distrattori()` esclude solo lo stesso `id`, non la stessa
definizione: nella scelta multipla possono comparire due risposte identiche, una
segnata giusta e una sbagliata.

### 24. 309 definizioni sotto i 25 caratteri
Da guardare: quante sono davvero povere («Che non si può cancellare.») e se il
punteggio di scheda dovrebbe scartarle invece di limitarsi a ordinarle.

---

## Fascia 7 — piccoli debiti

### 25. `__pycache__` tracciato in git **[misurato]**
`strumenti/__pycache__/costruisci.cpython-311.pyc` è versionato e si sporca a
ogni esecuzione. Va tolto dal tracciamento e ignorato.

### 26. Codice morto **[misurato]**
`ripasso.js:86` aggiunge un gestore vuoto che non disattiva niente (ci pensa già
la variabile `risposto`); `store.js:218` assegna `g` e non la usa.

### 27. Il codice di ripristino viene da `Math.random()`
18 sillabe, 4 gruppi da 2 → circa 1,1·10¹⁰ combinazioni, ma generate da un PRNG
non crittografico. Per un codice che è l'unica chiave dei dati, `crypto` costa
una riga. Valore basso finché non esiste un server: oggi il codice non apre
nulla.

### 28. Il formato data salvato non è ordinabile **[misurato]**
`oggiISO()` produce `2025-3-9`, non `2025-03-09`: l'array `giorni` non si può
ordinare né confrontare lessicograficamente. Cambiarlo richiede una migrazione
dei dati salvati. Valore basso, rischio medio: ultimo della lista, o mai.

---

## Cosa NON è in questo piano, e perché

- **Server per le Web Push.** È il primo dei «passi successivi» del README, ma
  cambia la natura del progetto («nessun server») e non si può decidere qui.
- **Valutazione automatica delle frasi.** Richiede un modello linguistico:
  fuori portata per una sessione di manutenzione.
- **Riscrittura delle definizioni goffe.** È lavoro editoriale, non tecnico.
- **Rigenerazione del corpus dal dump.** Scaricare 1 GB dal Wikizionario e
  rieseguire l'intera pipeline cambierebbe migliaia di voci in un colpo solo:
  nessuna prova esistente sarebbe in grado di dire se il risultato è migliore.
  La voce 2 ripara i difetti noti senza rimescolare il corpus.
