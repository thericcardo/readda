# Ricostruire Readda su Emergent

> **Leggi prima questo.** Emergent non può generare il corpus. Le 13.589 voci
> italiane vengono dal parsing di un dump da 68 MB del Wikizionario: nessun
> prompt le fa comparire. Se incolli solo il testo qui sotto ottieni
> un'applicazione perfetta con cinquanta parole dentro. **I dati vanno importati**,
> e come farlo è il punto 2 del prompt.

---

## Come usarlo

1. Su Emergent, crea una nuova app e incolla **tutto** il blocco qui sotto come
   primo messaggio.
2. Quando l'agente chiede i dati, caricagli i 64 file `data/blocco-NN.js` e
   `data/manifesto.js` di questa repo, oppure dagli l'URL del repository.
3. Verifica i tre punti della sezione finale *Come controllare che funzioni*
   prima di considerarla finita: sono i tre difetti che in questa
   implementazione sono costati più tempo, e un agente li rifarà.

---

## Il prompt

````text
Costruisci "Readda", un'applicazione web per aiutare chi parla italiano a
recuperare le parole della propria lingua. Non quelle che non conosce: quelle
che conosce e non usa mai. Questa distinzione è l'intero prodotto: tienila
presente in ogni decisione.

Stack: React + Tailwind sul davanti, FastAPI + MongoDB dietro. Deve funzionare
bene su telefono, in verticale.

────────────────────────────────────────────────────────────
1. IL MECCANISMO CENTRALE
────────────────────────────────────────────────────────────

La schermata principale è un flusso verticale di carte, una parola per carta,
da scorrere come un social. Su ogni carta tre azioni:

  • "Non la conosco"  → la parola entra nel ripasso a RICONOSCIMENTO:
    scelta multipla fra quattro definizioni, di cui tre pescate da altri lemmi
    dello stesso dominio semantico (così la scelta è difficile).

  • "La conosco, non la uso"  → la parola entra nel ripasso a PRODUZIONE:
    l'utente deve SCRIVERE una frase vera che la contenga. Non basta dichiarare
    di averla usata. Icona: cuore spezzato.

  • "La uso già"  → si passa oltre. Ma nel 18% dei casi l'app bluffa e due
    giorni dopo chiede comunque di dimostrarlo con una frase.

Gesti: trascinamento verso sinistra = non la conosco, verso destra = la conosco
ma non la uso, verso l'alto = la uso già. Tastiera: 1, 2, 3.

REGOLE CHE NON VANNO NEGOZIATE, e il motivo:

  a) Il peso del prodotto sta su "conosco ma non uso", non su "non conosco".
     Le parole che non si conoscono sono la categoria con il rendimento più
     basso: non hanno nessun aggancio nella vita di chi legge. Le parole in
     memoria passiva sono l'unica zona dove il guadagno è immediato.
     Di conseguenza il ripasso mette SEMPRE la produzione prima del
     riconoscimento.

  b) Una parola diventa "tua" dopo TRE frasi scritte, mai dopo un tocco su
     "lo so". L'autovalutazione è il dato più inaffidabile che esista: si
     riconosce la forma grafica e la si scambia per conoscenza semantica.

  c) Una parola riconosciuta abbastanza volte nel test a scelta multipla non
     esce dal sistema: passa da "non la conosco" a "la conosco, non la uso",
     perché riconoscere non è usare.

  d) Il controllo della frase scritta accetta la parola FLESSA, non solo la
     forma esatta: "ho blandito" vale per "blandire". Si confronta la radice
     (lemma meno le ultime 2-3 lettere, minimo 4 caratteri). I participi
     irregolari (eludere → eluso, ascrivere → ascritto) non si ricavano da
     nessuna regola: stanno dichiarati nel campo `forme` di ogni voce.

Ripetizione dilazionata: caselle di Leitner con intervalli
10 minuti, 1 giorno, 3, 7, 16, 35 giorni. Risposta giusta promuove di una
casella, sbagliata retrocede.

────────────────────────────────────────────────────────────
2. IL CORPUS — VA IMPORTATO, NON GENERATO
────────────────────────────────────────────────────────────

NON inventare le parole e NON generare definizioni: sarebbero inaffidabili.
Ti fornisco 13.589 voci italiane già filtrate. Importale in MongoDB, una
collezione `lemmi`, indice unico su `id`.

Ogni voce ha questa forma:

  {
    "id": "blandire",              // il lemma, chiave primaria
    "pos": "verbo",                // nome | aggettivo | verbo | avverbio
    "sill": "blan·dì·re",          // sillabazione con accento tonico
    "def": "Lusingare con dolcezza per ottenere qualcosa o per calmare.",
    "es": "Blandiva il pubblico invece di informarlo.",   // può mancare
    "sin": ["lusingare", "adulare", "carezzare"],
    "dom": ["lingua", "politica"], // uno o due domini
    "lvl": 3,                      // 1 comune, 2 formale, 3 ricercato
    "reg": "letterario",
    "etim": "dal latino blandiri", // può mancare
    "forme": ["blandit"],          // radici irregolari, può mancare
    "sens": 0                      // 1 = lessico esplicito, vedi punto 6
  }

I domini possibili sono esattamente quindici: lavoro, diritto, politica,
pensiero, scuola, scienza, lingua, tecnologia, emozioni, tempo, storia,
natura, medicina, cucina, arte, più "generale" per chi non ne ha.

Le definizioni vengono dal Wikizionario italiano, licenza CC BY-SA 3.0.
Questo comporta due obblighi che devi implementare, non sono facoltativi:
  • un credito visibile nella schermata profilo, con collegamento a
    https://creativecommons.org/licenses/by-sa/3.0/deed.it e la parola
    "con modifiche";
  • un credito sulla scheda di dettaglio di ogni parola.
Rendili leggibili: un grigio al 16% di opacità non soddisfa la licenza.

────────────────────────────────────────────────────────────
3. COME SI COMPONE IL FLUSSO — LA PARTE PIÙ FACILE DA SBAGLIARE
────────────────────────────────────────────────────────────

All'iscrizione l'utente risponde a tre domande: di cosa ti occupi (uno dei
domini), cosa ti va di leggere (almeno due domini), dove vuoi arrivare
(base / medio / alto, che fissa il livello massimo delle parole: 1, 2 o 3).

Gli interessi dichiarati sono un'INCLINAZIONE, NON UN FILTRO. Ogni infornata
di carte si compone per strati, con quote fisse:

    70%  lessico generale
    22%  i temi di chi legge (lavoro + interessi)
     8%  tutto il resto

"Generale" NON significa "senza dominio": significa "non specialistico". Sono
specialistici solo medicina, diritto, tecnologia, scienza e lavoro. Emozioni,
tempo, lingua, pensiero, natura, storia, politica, scuola, arte e cucina sono
categorie umane, e le parole che vi appartengono sono lessico per chiunque.
Una parola può stare insieme nello strato "generale" e in quello dei temi.

Dentro ogni strato la scelta è ESTRAZIONE PESATA, NON ORDINAMENTO. Usa la
chiave di Efraimidis-Spirakis: per ogni candidato calcola
  chiave = random() ** (1 / peso)
e prendi le chiavi più grandi. Il peso vale 1, più 1.1 se il livello coincide
con quello scelto, più 0.5 se la voce ha un esempio d'uso, per 0.45 se il
livello è sopra quello scelto.

Escludi dal flusso le parole già giudicate: vivono nel ripasso.

────────────────────────────────────────────────────────────
4. ACCESSO
────────────────────────────────────────────────────────────

Solo nickname. Niente email, niente password. All'iscrizione genera un codice
di ripristino di quattro pseudo-parole separate da trattini (es.
"torcam-camfal-camcor-branis") e mostralo PRIMA di far proseguire, con scritto
chiaramente che senza quel codice i progressi non tornano indietro.
Più persone devono poter usare lo stesso dispositivo.
Nel profilo: un pulsante per esportare tutti i dati come stringa e uno per
reimportarli.

────────────────────────────────────────────────────────────
5. ASPETTO — deve sembrare costoso, non colorato
────────────────────────────────────────────────────────────

Due colori soltanto:
  verde oliva scuro  #202B22   (base)
  giallo reale       #FFD85F   (accento)

Palette completa da usare come variabili CSS:
  --fondo        #151C17     fondo della pagina
  --carta        #202B22     le carte
  --carta-alta   #26332A     superfici sollevate
  --oro          #FFD85F
  --oro-tenue    #C9A94E
  --inchiostro   #F3F1E8     testo principale (bianco caldo, mai bianco puro)
  --inchiostro-2 rgba(243,241,232,.66)
  --inchiostro-3 rgba(243,241,232,.40)
  --filo         rgba(255,216,95,.13)   bordi sottili dorati

IL PRINCIPIO: l'oro è raro. Al massimo UN elemento dorato pieno per schermata.
Tutto il resto lo usa come filo di un pixel, non come campitura. È questo che
fa sembrare un'interfaccia costosa: la parsimonia, non l'abbondanza.

Caratteri: un serif per il lemma e i titoli (Fraunces, con riserva Georgia),
un sans per l'interfaccia (Inter). Il lemma sulla carta va grande —
clamp(38px, 11.5vw, 54px) — con crenatura stretta, -0.035em.

La carta: angoli da 26px, gradiente diagonale appena percettibile dal
--carta-alta al --carta, bordo di un pixel quasi invisibile, ombra bassa e
larga (0 28px 64px -28px rgba(0,0,0,.8)), e un alone dorato al 8% in alto.
Sopra tutto, una grana SVG al 5% di opacità: toglie il piatto dal fondo scuro.

Ordine sulla carta: etichette piccole maiuscole → lemma in serif →
sillabazione in oro → categoria grammaticale in corsivo → definizione →
esempio in corsivo con un filo dorato a sinistra → sinonimi come pillole.

Movimenti: cubic-bezier(.22,1,.36,1), 300-400ms. Mai rimbalzi.

Schermate: Flusso, Ripasso, Raccolta (tre filtri: Da usare / Da imparare /
Mie), Io. Barra di navigazione in basso, sfocata, con un trattino dorato sopra
la voce attiva.

────────────────────────────────────────────────────────────
6. LESSICO ESPLICITO
────────────────────────────────────────────────────────────

Alcune voci hanno `sens: 1`: sono volgari o sessualmente esplicite. Tienile
FUORI dal flusso per impostazione predefinita, con un interruttore nel profilo
per includerle. Non cancellarle: restano nel corpus.
Non filtrare i termini clinici né quelli neutri su identità e orientamento.

────────────────────────────────────────────────────────────
7. PROMEMORIA
────────────────────────────────────────────────────────────

Notifiche push vere, con Web Push e chiavi VAPID lato server — questo è il
punto in cui un backend serve davvero. Il messaggio per le parole passive è
una domanda, non un avviso: «L'hai usata, "blandire"? Scrivi una frase vera in
cui l'hai detta o scritta.»

────────────────────────────────────────────────────────────
COME CONTROLLARE CHE FUNZIONI
────────────────────────────────────────────────────────────

Tre prove. Sono i tre difetti che costano più tempo, e vanno verificati
misurando, non guardando:

1. Simula trenta giorni d'uso con un profilo "medico" (lavoro: medicina,
   interessi: medicina e scienza), quindici parole al giorno. Il lessico
   generale deve risultare circa il 70% delle parole viste. Se esce sotto il
   50%, gli interessi stanno filtrando invece di inclinare.

2. Apri il flusso venti volte di seguito con cronologia vuota. Devono uscire
   più di 600 parole distinte. Se ne escono sessanta sempre uguali, stai
   ordinando per peso invece di estrarre: con migliaia di candidati un lemma
   di peso 1 non entra mai fra i primi se centinaia hanno peso 2.6.

3. Scrivi "Ieri ho blandito la platea" nel test di produzione per il lemma
   "blandire": deve essere accettata. Scrivi "Ieri ho parlato alla platea":
   deve essere rifiutata.
````

---

## Cosa cambierà rispetto a questa versione

| | Qui | Su Emergent |
|---|---|---|
| Dati | 64 file statici, caricati a blocchi | MongoDB |
| Stato utente | `localStorage` | Documento server |
| Notifiche | Solo ad app aperta | Web Push vere |
| Multi-dispositivo | Export/import a mano | Automatico |

Il guadagno vero è il terzo: le notifiche push sono il meccanismo centrale di
Readda, e senza server restano inerti.
