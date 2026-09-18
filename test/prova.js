const { ctx, carica } = require('./banco');

let passate = 0, fallite = 0;
function ok(nome, cond, extra) {
  if (cond) { passate++; console.log('  ok   ' + nome); }
  else { fallite++; console.log('  FALL ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

carica('data/lemmi.js');
carica('js/srs.js');
carica('js/store.js');

const L = ctx.READDA_LEMMI, S = ctx.Readda.Store, R = ctx.Readda.Srs;

gruppo('Corpus');
ok('almeno 100 lemmi', L.length >= 100, L.length);
ok('id tutti unici', new Set(L.map(x => x.id)).size === L.length);
ok('id coincide col lemma', L.every(x => x.id === x.lemma));
ok('campi obbligatori presenti', L.every(x => x.def && x.es && x.sill && x.pos && x.dom.length && x.lvl >= 1 && x.lvl <= 3));
ok('sillabazione col separatore', L.every(x => x.sill.indexOf('·') > 0));
ok('esempio contiene la parola flessa', L.every(x => R.contiene(x.es, x.lemma)),
   L.filter(x => !R.contiene(x.es, x.lemma)).map(x => x.id));
ok('nessuna definizione duplicata', new Set(L.map(x => x.def)).size === L.length);
ok('sinonimi sempre presenti', L.every(x => x.sin && x.sin.length >= 1));

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
const dist = R.distrattori(L[0], 3);
ok('tre distrattori generati', dist.length === 3);
ok('nessun distrattore uguale alla definizione giusta', dist.every(d => d !== L[0].def));
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

console.log('\n' + (fallite === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') + ' — ' + passate + ' passate, ' + fallite + ' fallite\n');
process.exit(fallite ? 1 : 0);
