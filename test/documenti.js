/* I numeri scritti nei documenti devono essere quelli del corpus.
 *
 * FONTI.md ha dichiarato per mesi «11.326 voci, di cui 11.192 dal
 * Wikizionario, 33 esplicite, l'1,4% delle pagine lette» mentre il manifesto
 * ne contava 13.589, 13.455 e 46. Non e' una svista di battitura: sono i
 * numeri su cui si regge l'attribuzione della licenza, e chi legge FONTI.md
 * lo fa proprio per sapere quante voci sono di chi.
 *
 * Correggerli una volta non serve a niente: ridivergono alla prossima
 * ricostruzione del corpus. Qui si legge il manifesto e si controlla che i
 * documenti dicano quello.
 *
 *     node test/documenti.js
 */
const fs = require('fs');
const path = require('path');
const { ctx, carica } = require('./banco');

const RADICE = path.join(__dirname, '..');
carica('data/manifesto.js');
const M = ctx.window.READDA_MANIFESTO;

let passate = 0, fallite = 0;
function ok(nome, cond, extra) {
  if (cond) { passate++; console.log('  ok   ' + nome); }
  else { fallite++; console.log('  FALL ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

const leggi = f => fs.readFileSync(path.join(RADICE, f), 'utf8');
/* `toLocaleString('it-IT')` non raggruppa i numeri di quattro cifre: 8660
   resta "8660" e 13589 diventa "13.589". Nei documenti pero' sono scritti
   allo stesso modo, quindi il punto lo si mette a mano. */
const italiano = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const VOCI = M.voci;
const CURATE = M.curati;
const AUTOMATICHE = VOCI - CURATE;
const ESPLICITE = M.espliciti;

/* I documenti che parlano al pubblico. PIANO.md e PROGRESSI.md sono appunti
   di lavorazione e citano di proposito i numeri vecchi accanto ai nuovi. */
const PUBBLICI = ['README.md', 'FONTI.md'];

gruppo('I documenti dichiarano i numeri del corpus');
PUBBLICI.forEach(function (f) {
  const t = leggi(f);
  ok(f + ' dichiara le ' + italiano(VOCI) + ' voci del corpus',
     t.indexOf(italiano(VOCI)) >= 0);
  ok(f + ' dichiara le ' + CURATE + ' voci scritte a mano',
     new RegExp('\\b' + CURATE + '\\b').test(t));
  ok(f + ' dichiara le ' + ESPLICITE + ' voci esplicite',
     new RegExp('\\b' + ESPLICITE + '\\b').test(t));
});
ok('FONTI.md dichiara quante voci vengono dal Wikizionario',
   leggi('FONTI.md').indexOf(italiano(AUTOMATICHE)) >= 0, italiano(AUTOMATICHE));

gruppo('Nessun conteggio scaduto');
/* Ogni numero col separatore delle migliaia seguito da "voci" e' una
   dichiarazione sul corpus. Deve essere un valore che si sa spiegare: o uno
   di quelli attuali, o una cifra storica che il testo cita di proposito.
   L'elenco e' scritto qui apposta - aggiungerne uno obbliga a dire perche'. */
const AMMESSI = {};
AMMESSI[italiano(VOCI)] = 'il corpus di adesso';
AMMESSI[italiano(AUTOMATICHE)] = 'quante vengono dal Wikizionario';
AMMESSI[italiano(8660)] = 'lo strato generale, misurato da Srs.generale()';
AMMESSI[italiano(3419)] = 'lo strato generale prima della ridefinizione, citato come storia';
AMMESSI[italiano(4500)] = 'il tetto che abbassare i filtri non superava, citato come storia';
AMMESSI[italiano(11147)] = 'scarto: non e\' lessico da prodotto';
AMMESSI[italiano(3749)] = 'scarto: definizione circolare';
AMMESSI[italiano(3402)] = 'scarto: coda troppo rara';
AMMESSI[italiano(2230)] = 'scarto: rimanda a un\'altra voce';
AMMESSI[italiano(11326)] = 'il conteggio che FONTI.md dichiarava per sbaglio, citato come storia';

PUBBLICI.forEach(function (f) {
  const t = leggi(f);
  const citati = (t.match(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?=\s+voci)/g) || []);
  const ignoti = citati.filter(n => !AMMESSI[n]);
  ok(f + ' non cita conteggi di voci che non si sanno spiegare',
     ignoti.length === 0, [...new Set(ignoti)]);
});

gruppo('Le percentuali seguono i conteggi');
{
  const t = leggi('FONTI.md') + '\n' + leggi('README.md');
  const attesa = (100 * ESPLICITE / VOCI).toFixed(2).replace('.', ',');
  ok('la quota di lessico esplicito e\' quella vera (' + attesa + '%)',
     t.indexOf(attesa + '%') >= 0, attesa + '%');
  // 13.589 su 782.769 pagine lette
  const sopravvive = (100 * VOCI / 782769).toFixed(1).replace('.', ',');
  ok('la quota di pagine sopravvissute e\' quella vera (' + sopravvive + '%)',
     t.indexOf(sopravvive + '%') >= 0, sopravvive + '%');
}

gruppo('I commenti del codice non raccontano un\'altra storia');
{
  /* Il commento sopra QUOTE in js/srs.js e' la prima cosa che legge chi
     tocca la selezione del flusso: conta piu' del README. Parlava ancora di
     3.419 voci e di undici mesi, numeri di due versioni prima. */
  const srs = leggi('js/srs.js');
  const dichiarati = (srs.match(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?![\d.])/g) || []);
  const attesi = ['8.660', '3.419', '13.589', '2.572', '4.500'];
  const estranei = dichiarati.filter(n => attesi.indexOf(n) < 0);
  ok('js/srs.js non cita conteggi superati', estranei.length === 0, [...new Set(estranei)]);
  ok('js/srs.js cita lo strato generale di adesso', srs.indexOf('8.660') >= 0);
}

gruppo('I comandi documentati esistono');
{
  const pkg = JSON.parse(leggi('package.json'));
  const readme = leggi('README.md');
  // `npm root -g` non e' uno script del progetto: serve a trovare i moduli
  // globali per far girare Playwright
  const NON_SCRIPT = ['root', 'install', 'ci', 'init', 'exec'];
  const invocati = (readme.match(/npm (?:run )?[a-z0-9:]+/g) || [])
    .map(c => c.replace(/npm (?:run )?/, ''))
    .filter(c => NON_SCRIPT.indexOf(c) < 0);
  const assenti = [...new Set(invocati)].filter(c => !pkg.scripts[c]);
  ok('ogni npm run citato nel README esiste in package.json',
     assenti.length === 0, assenti);

  const file = (readme.match(/(?:node|python3) ([\w/.]+\.(?:js|py))/g) || [])
    .map(c => c.replace(/(?:node|python3) /, ''));
  const perduti = [...new Set(file)].filter(f => !fs.existsSync(path.join(RADICE, f)));
  ok('ogni file citato in un comando del README esiste', perduti.length === 0, perduti);
}

console.log('\n' + (fallite === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') +
            ' — ' + passate + ' passate, ' + fallite + ' fallite\n');
process.exit(fallite ? 1 : 0);
