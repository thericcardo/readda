const { ctx, carica, caricaCorpus } = require('./banco');

let passate = 0, fallite = 0;
function ok(nome, cond, extra) {
  if (cond) { passate++; console.log('  ok   ' + nome); }
  else { fallite++; console.log('  FALL ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

carica('js/srs.js');
carica('js/store.js');
const C = caricaCorpus(8);
const S = ctx.Readda.Store, R = ctx.Readda.Srs;
const L = C.disponibili();

gruppo('Corpus');
ok('il manifesto dichiara almeno 10.000 voci', C.totale() >= 10000, C.totale());
ok('otto blocchi caricati portano almeno 1.000 voci', L.length >= 1000, L.length);
ok('i blocchi non caricati non pesano', C.quantiCaricati() === 8, C.quantiCaricati());
ok('id tutti unici', new Set(L.map(x => x.id)).size === L.length);
ok('id coincide col lemma', L.every(x => x.id === x.lemma));
ok('ogni voce sta nel blocco che il suo hash indica',
   L.every(x => C.lemma(x.id) === x), L.filter(x => C.lemma(x.id) !== x).slice(0,3).map(x=>x.id));
// l'esempio d'uso non c'e' su tutte le voci: e' un di piu', non un obbligo
ok('campi obbligatori presenti',
   L.every(x => x.def && x.sill && x.pos && x.dom.length && x.lvl >= 1 && x.lvl <= 3),
   L.filter(x => !(x.def && x.sill && x.pos && x.dom.length)).slice(0, 3).map(x => x.id));
ok('sillabazione col separatore', L.every(x => x.sill.indexOf('·') > 0));
const conEs = L.filter(x => x.es);
ok('dove c\'e\' un esempio, contiene la parola flessa',
   conEs.filter(x => !R.contiene(x.es, x.lemma)).length / Math.max(conEs.length, 1) < 0.08,
   conEs.filter(x => !R.contiene(x.es, x.lemma)).slice(0, 3).map(x => x.id));
ok('quasi nessuna definizione duplicata',
   new Set(L.map(x => x.def)).size / L.length > 0.985);
ok('livelli tutti fra 1 e 3', L.every(x => x.lvl >= 1 && x.lvl <= 3));
const radiceDi = w => w.length <= 5 ? w : w.slice(0, Math.max(4, w.length - 3));
const circolari = L.filter(x => new RegExp('\\b' + radiceDi(x.lemma), 'i').test(x.def));
ok('nessuna definizione ripete il proprio lemma', circolari.length === 0,
   circolari.slice(0, 4).map(x => x.id + ': ' + x.def.slice(0, 40)));

gruppo('Account');
ok('rifiuta nickname vuoto', S.registra('').ok === false);
ok('rifiuta nickname di 1 carattere', S.registra('a').ok === false);
const reg = S.registra('Riccardo');
ok('registra e restituisce un codice', reg.ok && /^[a-z]+(-[a-z]+){3}$/.test(reg.codice), reg.codice);
ok('rifiuta il duplicato', S.registra('riccardo').ok === false);
ok('entra con nickname', S.entra('Riccardo').ok === true);
ok('nickname inesistente non entra', S.entra('nessuno').ok === false);
ok('sessione ripresa', (S.entra('Riccardo'), S.riprendiSessione() === true));

gruppo('Profilo e coda del flusso');
S.aggiornaProfilo({ lavoro: 'scuola', interessi: ['lingua', 'pensiero'], obiettivo: 'alto', completo: true });
const coda = R.coda(S.profilo(), S.tutteLeParole(), 20);
ok('la coda restituisce lemmi', coda.length === 20);
ok('nessun duplicato in coda', new Set(coda.map(x => x.id)).size === coda.length);
const quotaTema = coda.filter(x => x.dom.includes('lingua') || x.dom.includes('pensiero') || x.dom.includes('scuola')).length;
ok('gli interessi pesano davvero (>40% della coda)', quotaTema / coda.length > 0.4, (quotaTema / coda.length).toFixed(2));

gruppo('Le tre azioni');
C.assicura(['coacervo', 'blandire', 'fugace'], () => {});
S.segna('coacervo', 'ignota');
S.segna('blandire', 'passiva');
S.segna('fugace', 'attiva');
ok('ignota registrata', S.parola('coacervo').stato === 'ignota');
ok('passiva parte da box 1', S.parola('blandire').box === 1);
ok('ignota ha un ripasso in programma', S.parola('coacervo').prox > Date.now());
ok('parole giudicate escono dal flusso', R.coda(S.profilo(), S.tutteLeParole(), 200).every(x => !['coacervo', 'blandire', 'fugace'].includes(x.id)));

gruppo('Riconoscimento (parole ignote)');
S.parola('coacervo').prox = Date.now() - 1000;
let dovute = R.scadenze(S.tutteLeParole());
ok('la parola scaduta compare nel ripasso', dovute.some(d => d.id === 'coacervo'));
ok('tipo corretto: riconoscimento', dovute.find(d => d.id === 'coacervo').tipo === 'riconoscimento');
const boxPrima = S.parola('coacervo').box;
S.registraProva('coacervo', true);
ok('risposta esatta promuove di casella', S.parola('coacervo').box === boxPrima + 1);
S.registraProva('coacervo', false);
ok('risposta sbagliata retrocede', S.parola('coacervo').box === boxPrima);
for (let i = 0; i < 6; i++) S.registraProva('coacervo', true);
ok('riconosciuta abbastanza volte → diventa passiva', S.parola('coacervo').stato === 'passiva');

gruppo('Produzione (il cuore: conosco ma non uso)');
S.parola('blandire').prox = Date.now() - 1000;
dovute = R.scadenze(S.tutteLeParole());
ok('tipo corretto: produzione', dovute.find(d => d.id === 'blandire').tipo === 'produzione');
ok('accetta la forma flessa', R.contiene('Il candidato blandiva la platea', 'blandire'));
ok('accetta il participio', R.contiene('Ha blandito tutti', 'blandire'));
ok('rifiuta la frase senza la parola', !R.contiene('Il candidato parlava alla platea', 'blandire'));
ok('rifiuta parola diversa con inizio simile', !R.contiene('una cosa bianca', 'blandire'));
S.registraUso('blandire', 'Il candidato blandiva la platea.');
ok('primo uso salvato', S.parola('blandire').usi.length === 1);
ok('ancora passiva dopo un uso', S.parola('blandire').stato === 'passiva');
S.registraUso('blandire', 'Non mi faccio blandire.');
S.registraUso('blandire', 'Blandire non è convincere.');
ok('tre usi scritti → diventa attiva', S.parola('blandire').stato === 'attiva');
ok('uscita dalla coda dei ripassi', S.parola('blandire').prox === 0);

gruppo('Bluff sulle parole date per note');
let bluffate = 0;
for (let i = 0; i < 400; i++) {
  const id = L[i % L.length].id;
  S.dimentica(id);
  S.segna(id, 'attiva');
  if (S.parola(id).bluff) bluffate++;
}
ok('circa il 18% viene messo alla prova', bluffate / 400 > 0.10 && bluffate / 400 < 0.27, (bluffate / 400).toFixed(3));
const idBluff = Object.keys(S.tutteLeParole()).find(k => S.parola(k).bluff);
S.parola(idBluff).prox = Date.now() - 1000;
ok('la parola bluffata torna come produzione', R.scadenze(S.tutteLeParole()).find(d => d.id === idBluff).tipo === 'produzione');

gruppo('Test a scelta multipla');
const dist = R.distrattori(C.lemma('blandire'), 3);
ok('tre distrattori generati', dist.length === 3);
ok('nessun distrattore uguale alla definizione giusta', dist.every(d => d !== C.lemma('blandire').def));
ok('distrattori distinti fra loro', new Set(dist).size === 3);

gruppo('Striscia di giorni');
ok('la striscia è attiva oggi', S.strisciaViva() >= 1, S.strisciaViva());
ok('conteggio di oggi coerente', S.fatteOggi() > 0);

gruppo('Esporta e ripristina');
const pacco = S.esporta();
ok('produce una stringa non vuota', typeof pacco === 'string' && pacco.length > 50);
const quante = Object.keys(S.tutteLeParole()).length;
const imp = S.importa(pacco);
ok('reimportazione riuscita', imp.ok && imp.nick === 'Riccardo');
ok('nessuna parola persa', Object.keys(S.tutteLeParole()).length === quante);
ok('rifiuta una stringa spazzatura', S.importa('non-un-codice').ok === false);

gruppo('Multiutente sullo stesso dispositivo');
S.registra('Ospite');
S.entra('Ospite');
ok('il nuovo account parte pulito', Object.keys(S.tutteLeParole()).length === 0);
S.entra('Riccardo');
ok('i dati del primo utente sono intatti', Object.keys(S.tutteLeParole()).length === quante);
ok('entrambi i nickname sono elencati', S.elencoNick().length === 2, S.elencoNick());

gruppo('Igiene del sorgente');
{
  const fsm = require('fs'), pth = require('path');
  const radiceProg = pth.join(__dirname, '..');
  const file = ['js/store.js', 'js/srs.js', 'js/notify.js', 'js/ui.js', 'js/app.js',
    'js/views/accesso.js', 'js/views/profilo.js', 'js/views/feed.js',
    'js/views/ripasso.js', 'js/views/collezione.js', 'js/views/io.js', 'js/corpus.js'];

  // Lettere cirilliche e greche identiche a occhio alle latine: dentro un
  // identificatore JavaScript passano la sintassi e rompono ogni ricerca.
  const INGANNEVOLI = /[\u0400-\u04FF\u0370-\u03FF]/;
  const sporchi = [];
  for (const f of file) {
    const t = fsm.readFileSync(pth.join(radiceProg, f), 'utf8');
    // via stringhe e commenti: negli identificatori non ci devono essere
    const codice = t.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');
    if (INGANNEVOLI.test(codice)) sporchi.push(f);
  }
  ok('nessuna lettera cirillica o greca negli identificatori', sporchi.length === 0, sporchi);

  // I diacritici combinanti letterali sono invisibili nell'editor: solo escape.
  const combinantiNudi = [];
  for (const f of file) {
    const t = fsm.readFileSync(pth.join(radiceProg, f), 'utf8');
    if (/[\u0300-\u036f]/.test(t.replace(/[\u00C0-\u017F]/g, ''))) combinantiNudi.push(f);
  }
  ok('nessun diacritico combinante nudo nel sorgente', combinantiNudi.length === 0, combinantiNudi);
}

gruppo('Lessico esplicito');
{
  const tutte = C.disponibili();
  const segnate = tutte.filter(x => x.sens);
  ok('qualche voce e\' segnata come esplicita', segnate.length > 0, segnate.length);
  ok('sono una frazione minima del corpus', segnate.length / tutte.length < 0.02,
     (100 * segnate.length / tutte.length).toFixed(2) + '%');
  // la precisione conta piu' della copertura: un falso positivo toglie una
  // parola buona dal flusso senza che nessuno se ne accorga
  const innocenti = ['cazzuola', 'piscina', 'inculcare', 'troiano', 'zoccolo', 'introito',
                     'verificare', 'classificare', 'pacificare', 'marrone', 'sedurre',
                     'omosessuale', 'minzione', 'circoncisione', 'defecazione'];
  const sbagliate = innocenti.filter(id => { const v = C.lemma(id); return v && v.sens; });
  ok('nessun omografo innocente viene segnato', sbagliate.length === 0, sbagliate);
  ok('i termini clinici e neutri restano nel flusso',
     ['minzione', 'omosessuale', 'circoncisione'].every(id => { const v = C.lemma(id); return !v || !v.sens; }));

  const prof = { interessi: ['lingua'], lavoro: 'scuola', obiettivo: 'alto' };
  const spenta = R.coda(prof, {}, 4000, false);
  const accesa = R.coda(prof, {}, 4000, true);
  ok('col filtro spento il flusso non pesca voci esplicite',
     spenta.every(x => !x.sens), spenta.filter(x => x.sens).slice(0, 3).map(x => x.id));
  ok('col filtro acceso le voci esplicite tornano disponibili',
     accesa.length >= spenta.length);
  ok('l\'impostazione parte spenta', S.impostazioni().esplicito === false);
}

gruppo('Leggibilita\' delle note obbligatorie');
{
  const fsm = require('fs'), pth = require('path');
  const io = fsm.readFileSync(pth.join(__dirname, '..', 'js/views/io.js'), 'utf8');
  ok('l\'attribuzione della licenza e\' nel sorgente', /CC BY-SA 3\.0/.test(io));
  ok('rimanda alla licenza con un collegamento', /creativecommons\.org\/licenses\/by-sa\/3\.0/.test(io));
  ok('dice che la clausola e\' virale', /mantenere la stessa licenza/.test(io));
  // --inchiostro-4 sta al 16% di opacita': invisibile, inaccettabile per una nota legale
  ok('nessuna nota resa col grigio piu\' tenue', !/inchiostro-4/.test(io),
     (io.match(/[^']*inchiostro-4[^']*/g) || []).slice(0, 2));
}

gruppo('Accenti e maiuscole nel riconoscimento');
ok('ignora le maiuscole', R.contiene('BLANDIRE la folla', 'blandire'));
ok('ignora gli accenti nel testo', R.contiene('La perifrasi \u00e8 gi\u00e0 una perifrasi', 'perifrasi'));
ok('trova un lemma accentato scritto senza accento', R.contiene('una societa perduta', 'societ\u00e0'));
ok('la punteggiatura attaccata non disturba', R.contiene('Che coacervo!', 'coacervo'));
ok('non confonde una parola che la contiene a meta\u0027', !R.contiene('il tedesco parla', 'tedio'));

gruppo('Impostazioni');
S.entra('Riccardo');
S.imposta('dose', 25);
ok('la dose si salva', S.impostazioni().dose === 25);
S.imposta('notifiche', true);
ok('le notifiche si salvano', S.impostazioni().notifiche === true);
S.entra('Ospite'); S.entra('Riccardo');
ok('le impostazioni sopravvivono al cambio account', S.impostazioni().dose === 25);

console.log('\n' + (fallite === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') + ' — ' + passate + ' passate, ' + fallite + ' fallite\n');
process.exit(fallite ? 1 : 0);
