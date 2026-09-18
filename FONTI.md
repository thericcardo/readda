# Fonti e licenze del corpus

## Le definizioni

Le definizioni, gli esempi d'uso, la sillabazione accentata, i sinonimi e le
etimologie di **11.192 delle 11.326 voci** provengono dal
[Wikizionario italiano](https://it.wiktionary.org), distribuito con licenza
[Creative Commons Attribuzione - Condividi allo stesso modo 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.it)
(CC BY-SA 3.0).

Le restanti **134 voci** sono scritte a mano per questo progetto e portano il
campo `curato`. Dove un lemma esisteva in entrambe le fonti, vince la versione
scritta a mano.

## Le modifiche apportate

Il testo del Wikizionario non è stato copiato così com'era. La pipeline in
`strumenti/`:

- rimuove il markup wiki, i template, le immagini e i collegamenti interni;
- risolve `{{Pn}}` nel nome della voce, altrimenti gli esempi restano con un buco;
- ricompone la sillabazione da `{{-sill-}}` nel formato `blan·dì·re`;
- normalizza i marcatori `{{Term|...}}` in quindici domini e in un registro;
- **scarta** le voci che non servono a questo prodotto: titoli composti, forme
  flesse, definizioni tassonomiche, glosse che rimandano a un'altra voce,
  definizioni circolari, citazioni al posto di definizioni, parole quotidiane e
  gergo troppo raro;
- assegna un livello da 1 a 3 incrociando il rango di frequenza.

Di 782.769 pagine lette ne sopravvivono 11.326: il 1,4%.

## Cosa comporta la licenza

CC BY-SA 3.0 è una licenza **virale sul contenuto derivato**. In pratica:

- il corpus in `data/` e chiunque lo ridistribuisca devono restare CC BY-SA 3.0,
  con attribuzione al Wikizionario e indicazione delle modifiche;
- l'attribuzione deve essere **visibile agli utenti**, non solo nel codice:
  nell'app sta nella schermata *Io* e nella scheda di dettaglio di ogni parola;
- il codice dell'applicazione è un'opera separata e non è vincolato dalla
  licenza del corpus;
- un uso commerciale è **permesso**, purché l'attribuzione e la clausola
  *condividi allo stesso modo* siano rispettate.

Se in futuro il corpus dovesse diventare proprietario, le definizioni andranno
riscritte da zero: la licenza non si può togliere.

## Lessico esplicito

Il Wikizionario è un dizionario completo, quindi contiene anche parole volgari e
voci sessualmente esplicite. Un flusso che pesca a caso può metterle davanti a
chiunque, anche in un'aula.

**33 voci su 11.326 (lo 0,29%)** sono segnate con `sens` e restano fuori dal
flusso finché non si accende l'interruttore in *Io → Lessico esplicito*. Non sono
cancellate: sono nel corpus e tornano disponibili quando si vuole.

La marcatura guarda **la parola, non la definizione**: il Wikizionario marca
l'intera voce come volgare se anche una sola delle sue accezioni lo è, e così
`marrone` (la castagna) e `sedurre` finivano segnati. Le radici sono ancorate
all'inizio della parola — cercarle come sottostringhe rendeva esplicite
`verificare`, `classificare` e `pacificare` — e c'è un elenco di omografi
innocenti da escludere (`cazzuola`, `piscina`, `inculcare`, `troiano`,
`zoccolo`, `introito`).

**Non sono segnati**, di proposito: i termini clinici (`minzione`,
`circoncisione`, `defecazione`) e quelli neutri su identità e orientamento
(`omosessuale`, `poliamoroso`). Toglierli sarebbe un errore, non una cautela.

## La lista di frequenza

I ranghi di frequenza vengono da
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(conteggi su sottotitoli OpenSubtitles 2018), licenza MIT. Servono solo a
ordinare e a scegliere: nessun testo di quella fonte finisce nel corpus.

## Riprodurre tutto

```bash
python3 strumenti/aggiorna.py
```

Scarica le fonti, riestrae, ricostruisce i blocchi e riporta cosa è cambiato.
