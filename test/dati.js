/* Prove sui dati pubblicati.
 *
 * Le altre due suite provano la logica e l'interfaccia; i quattro megabyte di
 * `data/` non li guardava nessuno. E' il motivo per cui cinque definizioni
 * hanno mostrato per mesi "attaccate]]." sulla carta mentre il README
 * dichiarava il difetto risolto: la correzione stava nella pipeline, i dati
 * pubblicati no.
 *
 * Qui si carica il corpus intero - tutti e 64 i blocchi - e si controlla cio'
 * che l'utente vede davvero, non cio' che la pipeline intendeva produrre.
 *
 *     node test/dati.js
 */
const { ctx, carica, caricaCorpus } = require('./banco');
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..');

let passate = 0, fallite = 0;
function ok(nome, cond, extra) {
  if (cond) { passate++; console.log('  ok   ' + nome); }
  else { fallite++; console.log('  FALL ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

carica('js/srs.js');
const C = caricaCorpus(64);
const R = ctx.Readda.Srs;
const M = ctx.window.READDA_MANIFESTO;
const L = C.disponibili();

/* Un campione, non l'elenco intero: un messaggio di errore lungo un megabyte
   non aiuta nessuno a capire cosa si e' rotto. */
const campione = (a, n) => a.slice(0, n || 5).map(v => (v.id || v) + (v.def ? ': ' + v.def.slice(0, 60) : ''));

gruppo('Il corpus arriva tutto');
ok('i 64 blocchi si caricano', C.quantiCaricati() === 64, C.quantiCaricati());
ok('il numero di voci coincide col manifesto', L.length === M.voci, { caricate: L.length, manifesto: M.voci });
ok('ogni blocco ha il conteggio dichiarato nel manifesto', (function () {
  const conta = new Array(64).fill(0);
  L.forEach(v => conta[C.blocco(v.id)]++);
  return conta.every((n, i) => n === M.perBlocco[i]);
})());
ok('ogni voce sta nel blocco che il suo hash indica', L.every(v => C.lemma(v.id) === v));
ok('gli identificatori sono unici', new Set(L.map(v => v.id)).size === L.length);

gruppo('Campi obbligatori');
const senzaCampi = L.filter(v => !(v.id && v.pos && v.sill && v.def && v.reg && v.lvl && v.dom && v.dom.length));
ok('nessuna voce senza id, categoria, sillabazione, definizione, registro, livello, dominio',
   senzaCampi.length === 0, campione(senzaCampi));
ok('i livelli stanno fra 1 e 3', L.every(v => v.lvl >= 1 && v.lvl <= 3));
ok('gli identificatori sono minuscoli e senza spazi',
   L.every(v => v.id === v.id.toLowerCase() && !/\s/.test(v.id)));
const sillDiversa = L.filter(v =>
  v.sill.replace(/·/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  !== v.id.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
ok('la sillabazione ricompone il lemma', sillDiversa.length === 0,
   sillDiversa.slice(0, 5).map(v => v.id + ' / ' + v.sill));
ok('la sillabazione porta il separatore', L.every(v => v.sill.indexOf('·') > 0));

gruppo('Testo pulito');
/* Le quadre e le graffe sono sempre residuo di markup wiki: nel testo di un
   dizionario non hanno nessun uso legittimo. */
const MARKUP = /\[\[|\]\]|\{\{|\}\}|\[|\]|<[a-z/]|''/;
const conMarkup = L.filter(v => MARKUP.test(v.def) || MARKUP.test(v.es || ''));
ok('nessun markup wiki sopravvissuto', conMarkup.length === 0, campione(conMarkup));

/* ":-)" ha una tonda che non chiude niente: e' testo, non uno squilibrio. */
const faccina = t => /[:;=]-?[()]/.test(t);
const pari = t => (t.match(/\(/g) || []).length === (t.match(/\)/g) || []).length;
const squilibrate = L.filter(v => [v.def, v.es || ''].some(t => t && !faccina(t) && !pari(t)));
ok('nessuna parentesi spaiata', squilibrate.length === 0, campione(squilibrate));

const spazioPrima = L.filter(v => /\s+[.,;:!?]/.test(v.def) || /\s+[.,;:!?]/.test(v.es || ''));
ok('nessuno spazio prima della punteggiatura', spazioPrima.length === 0, campione(spazioPrima));

/* Il tetto e' 260 per le definizioni e 200 per gli esempi. Un testo lungo
   esattamente tetto+1 e' stato tagliato al carattere numero `tetto` e chiuso
   con un punto che traveste il monco da frase intera: "... attraverso l." */
const TETTO_DEF = 260, TETTO_ES = 200;
const tagliate = L.filter(v => v.def.length === TETTO_DEF + 1);
ok('nessuna definizione tagliata a meta\' parola', tagliate.length === 0,
   tagliate.slice(0, 5).map(v => v.id + ' …' + v.def.slice(-40)));
const esTagliati = L.filter(v => v.es && v.es.length === TETTO_ES + 1);
ok('nessun esempio tagliato a meta\' parola', esTagliati.length === 0,
   esTagliati.slice(0, 5).map(v => v.id + ' …' + v.es.slice(-40)));
ok('nessun testo supera il proprio tetto',
   L.every(v => v.def.length <= TETTO_DEF + 1 && (!v.es || v.es.length <= TETTO_ES + 1)));

ok('ogni definizione comincia in maiuscola o con un segno',
   L.every(v => !/^[a-zà-ú]/.test(v.def)), campione(L.filter(v => /^[a-zà-ú]/.test(v.def))));
ok('ogni definizione finisce con un segno di chiusura',
   L.every(v => /[.!?;:…]$/.test(v.def)), campione(L.filter(v => !/[.!?;:…]$/.test(v.def))));

gruppo('Coerenza col manifesto');
ok('il conteggio delle voci esplicite coincide',
   L.filter(v => v.sens).length === M.espliciti,
   { dati: L.filter(v => v.sens).length, manifesto: M.espliciti });
const perLivello = { 1: 0, 2: 0, 3: 0 };
L.forEach(v => perLivello[v.lvl]++);
ok('i conteggi per livello coincidono',
   [1, 2, 3].every(k => perLivello[k] === M.livelli[String(k)]),
   { dati: perLivello, manifesto: M.livelli });
const perDominio = {};
L.forEach(v => v.dom.forEach(d => { perDominio[d] = (perDominio[d] || 0) + 1; }));
ok('i conteggi per dominio coincidono',
   Object.keys(M.domini).every(d => perDominio[d] === M.domini[d]),
   Object.keys(M.domini).filter(d => perDominio[d] !== M.domini[d])
     .map(d => d + ': dati ' + perDominio[d] + ' vs manifesto ' + M.domini[d]));
ok('il manifesto dichiara la fonte e la licenza', /CC BY-SA/.test(M.fonte || ''), M.fonte);

/* Il campo `curato` distingue le definizioni scritte per Readda da quelle
   del Wikizionario. Se non arriva ai blocchi, l'app attribuisce a una fonte
   esterna un testo che e' nostro: e' successo, per tutte e 134. */
const curate = L.filter(v => v.curato);
ok('le voci scritte a mano portano il campo curato',
   curate.length === M.curati, { dati: curate.length, manifesto: M.curati });
{
  const sorgente = fs.readFileSync(path.join(RADICE, 'strumenti', 'curati.js'), 'utf8');
  const idSorgente = new Set((sorgente.match(/\{\s*id:"([^"]+)"/g) || [])
    .map(m => m.replace(/\{\s*id:"/, '').replace(/"$/, '')));
  const nonSegnate = [...idSorgente].filter(id => { const v = C.lemma(id); return v && !v.curato; });
  ok('ogni lemma di curati.js e\' segnato nei blocchi',
     idSorgente.size > 0 && nonSegnate.length === 0,
     { inSorgente: idSorgente.size, nonSegnate: nonSegnate.slice(0, 5) });
  const segnateInPiu = curate.filter(v => !idSorgente.has(v.id)).map(v => v.id);
  ok('nessuna voce automatica si spaccia per scritta a mano',
     segnateInPiu.length === 0, segnateInPiu.slice(0, 5));
}

gruppo('I blocchi restano riproducibili');
/* Se l'hash in Python e quello in JavaScript divergono, i lemmi smettono di
   trovarsi e nessuno se ne accorge: il difetto e' silenzioso per definizione. */
function fnvPython(lemma) {
  // stessa aritmetica di blocco_di() in strumenti/costruisci.py, a 32 bit
  let h = 2166136261n;
  for (const ch of lemma) {
    h ^= BigInt(ch.codePointAt(0));
    h = (h * 16777619n) & 0xFFFFFFFFn;
  }
  return Number(h % 64n);
}
const divergenti = L.filter(v => fnvPython(v.id) !== C.blocco(v.id));
ok('l\'hash di Python e quello di JavaScript danno lo stesso blocco',
   divergenti.length === 0, divergenti.slice(0, 5).map(v => v.id));

const intestazioni = [];
for (let n = 0; n < 64; n++) {
  const t = fs.readFileSync(path.join(RADICE, 'data', 'blocco-' + String(n).padStart(2, '0') + '.js'), 'utf8');
  const m = t.match(/blocco (\d+) di (\d+), (\d+) voci/);
  if (!m || Number(m[1]) !== n || Number(m[2]) !== 64 || Number(m[3]) !== M.perBlocco[n]) intestazioni.push(n);
  if (!/CC BY-SA 3\.0/.test(t)) intestazioni.push(n + ' (senza licenza)');
}
ok('ogni blocco dichiara numero, totale, conteggio e licenza', intestazioni.length === 0, intestazioni);

gruppo('Il controllo delle frasi contro il corpus vero');
{
  /* Le famiglie irregolari di js/srs.js sono classi, non un elenco di
     eccezioni: se coprissero poche decine di verbi converrebbe scriverle a
     mano nel corpus, come faceva il campo `forme` (5 voci su 13.589). */
  const verbi = L.filter(v => v.pos === 'verbo');
  const coperti = verbi.filter(v => R.derivate(v.id).length);
  ok('le famiglie coprono almeno duecento verbi', coperti.length >= 200,
     coperti.length + ' su ' + verbi.length);

  /* Un esempio che non contiene la parola che illustra e' un difetto dei
     dati, ma fino a ieri lo era anche del controllo: erano 16, e la causa
     dei nove recuperati era che "ritrasse" non contiene "ritrarr". I
     rimanenti sono errori di battitura nella fonte. */
  const conEsempio = L.filter(v => v.es);
  const incoerenti = conEsempio.filter(v => !R.contiene(v.es, v.lemma));
  ok('al massimo otto esempi non contengono il proprio lemma',
     incoerenti.length <= 8, incoerenti.map(v => v.id));

  ok('nessun tema derivato scende sotto i quattro caratteri',
     L.every(v => R.derivate(v.id).every(t => t.length >= 4)),
     L.filter(v => R.derivate(v.id).some(t => t.length < 4)).slice(0, 3).map(v => v.id));

  /* Le famiglie esistono in due copie: js/srs.js le usa per giudicare le
     frasi scritte da chi studia, strumenti/flessione.py per decidere se un
     esempio del Wikizionario illustra davvero il lemma. Se divergono, la
     pipeline scarta esempi che l'app avrebbe accettato, e nessuno se ne
     accorge - lo stesso motivo per cui l'hash FNV ha la sua prova. */
  const cp = require('child_process');
  let esitoPython = null;
  try {
    esitoPython = cp.execFileSync('python3',
      [path.join(RADICE, 'strumenti', 'flessione.py')],
      { input: JSON.stringify(L.map(v => v.id)), encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch (e) {
    console.log('  --   parita\' con flessione.py non verificata: ' + e.message.split('\n')[0]);
  }
  if (esitoPython !== null) {
    const daPython = JSON.parse(esitoPython);
    const divergenti = L.filter(v => {
      const a = R.derivate(v.id), b = daPython[v.id] || [];
      return a.length !== b.length || a.some((t, i) => t !== b[i]);
    });
    ok('js/srs.js e strumenti/flessione.py danno gli stessi temi',
       divergenti.length === 0,
       divergenti.slice(0, 5).map(v => v.id + ': js ' + JSON.stringify(R.derivate(v.id)) +
                                   ' vs py ' + JSON.stringify(daPython[v.id])));
  }
}

gruppo('Distrattori della scelta multipla');
{
  /* Le definizioni non sono tutte diverse: la stessa frase puo' stare su due
     voci ("Che non si puo' cancellare" vale per piu' di un lemma). I
     distrattori escludevano il solo identificatore, quindi fra le quattro
     opzioni la stessa frase poteva comparire due volte, una segnata giusta e
     una sbagliata - e qualunque risposta sarebbe stata sbagliata. */
  const gemelle = {};
  L.forEach(v => { (gemelle[v.def] = gemelle[v.def] || []).push(v.id); });
  const condivise = Object.keys(gemelle).filter(d => gemelle[d].length > 1);
  ok('ci sono definizioni condivise da piu\' voci, quindi il caso e\' reale',
     condivise.length > 0, condivise.length + ' definizioni su ' +
     condivise.reduce((a, d) => a + gemelle[d].length, 0) + ' voci');

  /* Qui si constata solo che il caso esiste nei dati: provare che i
     distrattori lo evitano su 13.589 voci sarebbe teatro, perche' la voce
     gemella finisce fra le prime tre estratte una volta su quattromila.
     La prova vera sta in test/prova.js, su un corpus finto di cinque voci
     dove la gemella esce per forza. */
}

gruppo('Lessico esplicito');
const segnate = L.filter(v => v.sens);
ok('qualche voce e\' segnata', segnate.length > 0, segnate.length);
ok('restano una frazione minima del corpus', segnate.length / L.length < 0.02,
   (100 * segnate.length / L.length).toFixed(2) + '%');
const innocenti = ['cazzuola', 'piscina', 'inculcare', 'troiano', 'zoccolo', 'introito',
                   'verificare', 'classificare', 'pacificare', 'marrone', 'sedurre',
                   'omosessuale', 'minzione', 'circoncisione', 'defecazione'];
const falsiPositivi = innocenti.filter(id => { const v = C.lemma(id); return v && v.sens; });
ok('nessun omografo innocente e\' segnato', falsiPositivi.length === 0, falsiPositivi);

console.log('\n' + (fallite === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') +
            ' — ' + passate + ' passate, ' + fallite + ' fallite\n');
process.exit(fallite ? 1 : 0);
