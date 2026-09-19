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

// Gli interessi sono un'inclinazione, non un filtro. Prima pesavano e basta,
// e un profilo "medico" riceveva 450 parole mediche in un mese e zero lessico
// generale: "scevro" e "prevaricare" non arrivavano mai.
const prof = { lavoro: 'medicina', interessi: ['medicina', 'scienza'], obiettivo: 'alto' };
const mix = { tema: 0, generale: 0, altro: 0 };
const storia = {};
for (let g = 0; g < 30; g++) {
  for (const x of R.coda(prof, storia, 15, false)) {
    storia[x.id] = { stato: 'attiva' };
    const suo = x.dom.some(d => d === prof.lavoro || prof.interessi.includes(d));
    // stessa definizione che usa la coda, presa da li': duplicarla la fa divergere
    mix[suo ? 'tema' : (R.generale(x) ? 'generale' : 'altro')]++;
  }
}
const totMix = mix.tema + mix.generale + mix.altro;
ok('i temi di chi legge sono circa il 22%', Math.abs(mix.tema / totMix - 0.22) < 0.07,
   (100 * mix.tema / totMix).toFixed(0) + '%');
ok('"generale" vuol dire "non specialistico", non "senza dominio"',
   R.larghi().indexOf('emozioni') >= 0 && R.larghi().indexOf('medicina') < 0);
ok('il lessico generale domina il flusso, circa il 70%', Math.abs(mix.generale / totMix - 0.70) < 0.08,
   (100 * mix.generale / totMix).toFixed(0) + '%');
ok('resta spazio per l\'imprevisto', mix.altro / totMix > 0.03,
   (100 * mix.altro / totMix).toFixed(0) + '%');
// le quote nel codice e quelle misurate devono restare allineate
ok('le quote dichiarate sommano a uno',
   Math.abs(0.22 + 0.70 + 0.08 - 1) < 1e-9);

// Ordinare per peso rifa' del peso un filtro: con migliaia di candidati chi ha
// peso basso non entra mai fra i primi. L'estrazione dev'essere pesata, non ordinata.
const distinte = new Set();
for (let i = 0; i < 20; i++) R.coda(prof, {}, 60, false).forEach(x => distinte.add(x.id));
ok('venti aperture danno code diverse, non la stessa lista', distinte.size > 600, distinte.size);

const conteggio = {};
for (let i = 0; i < 200; i++) {
  for (const x of R.coda(prof, {}, 60, false)) conteggio[x.id] = (conteggio[x.id] || 0) + 1;
}
const scarse = ['scevro', 'prevaricare', 'zotico', 'supplicare', 'sussulto']
  .filter(id => C.lemma(id)).filter(id => !conteggio[id]);
ok('anche le parole a peso basso vengono estratte', scarse.length === 0, scarse);

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

gruppo('La striscia attraverso il cambio dell\'ora');
{
  /* "Ieri" veniva calcolato togliendo 864e5 millisecondi ad adesso. Il
     giorno del passaggio all'ora legale ne dura ventitre', quindi il giorno
     dopo, fra mezzanotte e l'una, quel conto torna indietro di due giorni e
     la striscia riparte da uno.

     La prova non si fida dell'aritmetica delle date per sapere qual e' il
     giorno prima: costruisce il calendario con numeri interi e una tabella
     dei giorni del mese, poi controlla un solo invariante, che vale in
     qualunque fuso: ieriISO() di oggi dev'essere oggiISO() del giorno prima. */
  const giorniDelMese = (a, m) =>
    [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28,
     31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

  const calendario = [];
  for (let a = 2024, m = 1, g = 1; calendario.length < 900; ) {
    calendario.push([a, m, g]);
    if (++g > giorniDelMese(a, m)) { g = 1; if (++m > 12) { m = 1; a++; } }
  }

  const VeraData = ctx.Date;
  const rotti = [];
  for (const ora of [0.5, 12, 23.5]) {
    let precedente = null;
    for (const [a, m, g] of calendario) {
      const istante = new VeraData(a, m - 1, g, Math.floor(ora), (ora % 1) * 60);
      ctx.Date = function (x) { return arguments.length ? new VeraData(x) : new VeraData(istante); };
      ctx.Date.now = () => istante.getTime();
      ctx.Date.prototype = VeraData.prototype;
      const oggi = S.oggiISO(), ieri = S.ieriISO();
      if (precedente !== null && ieri !== precedente) {
        rotti.push('alle ' + ora + ': ' + oggi + ' → ieri=' + ieri + ', atteso ' + precedente);
      }
      precedente = oggi;
    }
  }
  ctx.Date = VeraData;
  ok('per 900 giorni di fila, "ieri" e\' sempre il giorno prima (' +
     (process.env.TZ || 'fuso locale') + ')', rotti.length === 0, rotti.slice(0, 4));
}

gruppo('Esporta e ripristina');
const pacco = S.esporta();
ok('produce una stringa non vuota', typeof pacco === 'string' && pacco.length > 50);
const quante = Object.keys(S.tutteLeParole()).length;
const imp = S.importa(pacco);
ok('reimportazione riuscita', imp.ok && imp.nick === 'Riccardo');
ok('nessuna parola persa', Object.keys(S.tutteLeParole()).length === quante);
ok('rifiuta una stringa spazzatura', S.importa('non-un-codice').ok === false);

gruppo('Backup malformati e account di versioni precedenti');
{
  /* Il backup e' l'unica rete di sicurezza di un'app senza server. Se il
     ripristino puo' rompere l'app, la rete non c'e'. */
  const impacchetta = o => ctx.btoa(unescape(encodeURIComponent(JSON.stringify(o))));

  const rotti = [
    ['stringa vuota', ''],
    ['spazzatura', 'non-un-codice'],
    ['base64 che non e\' JSON', ctx.btoa('questo non e\' json')],
    ['JSON senza dati', impacchetta({ v: 1 })],
    ['profilo senza nickname', impacchetta({ v: 1, dati: { profilo: {} } })],
    ['nickname non testuale', impacchetta({ v: 1, dati: { profilo: { nick: 42 } } })],
    ['nickname di un carattere', impacchetta({ v: 1, dati: { profilo: { nick: 'x' } } })],
    ['dati non oggetto', impacchetta({ v: 1, dati: 'niente' })]
  ];
  const esplosi = [], accettati = [];
  rotti.forEach(function (c) {
    let r;
    try { r = S.importa(c[1]); } catch (e) { esplosi.push(c[0] + ': ' + e.message); return; }
    if (r.ok) accettati.push(c[0]);
    else if (!r.err) esplosi.push(c[0] + ': rifiutato senza messaggio');
  });
  ok('nessun backup malformato fa saltare l\'app', esplosi.length === 0, esplosi);
  ok('nessun backup malformato viene accettato', accettati.length === 0, accettati);

  /* Un account scritto da una versione precedente puo' non avere `usi`.
     Il ripasso e la schermata Io leggevano `p.usi.length` senza difese. */
  const vecchio = impacchetta({
    v: 1,
    dati: {
      profilo: { nick: 'Antico' },
      parole: {
        blandire: { stato: 'passiva' },                    // senza usi, box, prox
        coacervo: { stato: 'ignota', box: 2 },
        rumore:   { stato: 'boh' },                        // stato inesistente
        vuota:    null
      }
    }
  });
  const r = S.importa(vecchio);
  ok('un account senza i campi nuovi si importa', r.ok === true, r.err);
  const parole = S.tutteLeParole();
  ok('ogni parola ha un elenco di usi',
     Object.keys(parole).every(k => Array.isArray(parole[k].usi)));
  ok('ogni parola ha i contatori numerici',
     Object.keys(parole).every(k => typeof parole[k].box === 'number' &&
       typeof parole[k].prox === 'number' && typeof parole[k].ok === 'number'));
  ok('le parole senza uno stato valido vengono scartate',
     !parole.rumore && !parole.vuota && !!parole.blandire, Object.keys(parole));
  ok('le impostazioni mancanti prendono il valore di partenza',
     S.impostazioni().dose === 15 && S.impostazioni().esplicito === false, S.impostazioni());
  ok('un profilo senza codice ne riceve uno',
     /^[a-z]+(-[a-z]+){3}$/.test(S.profilo().codice), S.profilo().codice);
  // le scadenze devono poter girare su un account cosi'
  ok('il ripasso sa leggere un account vecchio', Array.isArray(R.scadenze(parole)));
  S.entra('Riccardo');
}

gruppo('Multiutente sullo stesso dispositivo');
S.registra('Ospite');
S.entra('Ospite');
ok('il nuovo account parte pulito', Object.keys(S.tutteLeParole()).length === 0);
S.entra('Riccardo');
ok('i dati del primo utente sono intatti', Object.keys(S.tutteLeParole()).length === quante);
ok('entrambi i nickname sono elencati',
   ['Riccardo', 'Ospite'].every(n => S.elencoNick().indexOf(n) >= 0), S.elencoNick());

gruppo('Igiene del sorgente');
{
  const fsm = require('fs'), pth = require('path');
  const radiceProg = pth.join(__dirname, '..');

  /* L'elenco dei file non si scrive a mano: si ricava dalle cartelle, cosi'
     un file nuovo e' coperto dal giorno in cui nasce. La lista scritta a mano
     che c'era prima conteneva solo i .js dell'app, e infatti la stessa lettera
     cirillica che questa prova cerca e' sopravvissuta per mesi dentro
     strumenti/costruisci.py, dove genera il corpus. */
  function sorgenti(cartella, estensioni, dentro) {
    const fuori = [];
    for (const nome of fsm.readdirSync(pth.join(radiceProg, cartella), { withFileTypes: true })) {
      const rel = cartella ? cartella + '/' + nome.name : nome.name;
      if (nome.isDirectory()) { if (dentro) fuori.push.apply(fuori, sorgenti(rel, estensioni, dentro)); }
      else if (estensioni.some(e => nome.name.endsWith(e))) fuori.push(rel);
    }
    return fuori;
  }
  const file = sorgenti('js', ['.js'], true)
    .concat(sorgenti('test', ['.js'], false))
    .concat(sorgenti('strumenti', ['.py'], false))
    .concat(['sw.js', 'eslint.config.mjs']);
  ok('la scansione trova tutti i sorgenti, non una lista scritta a mano',
     file.length >= 20 && file.indexOf('strumenti/costruisci.py') >= 0 &&
     file.indexOf('js/views/feed.js') >= 0, file.length);

  /* Cirillico e greco: in questo progetto non esiste un uso legittimo, in
     nessuna posizione. La versione precedente toglieva stringhe e commenti
     prima di cercare, perche' guardava solo gli identificatori - ed e'
     esattamente per questo che non ha mai visto "denar" scritto con tre
     lettere cirilliche (U+0434 U+0435 U+043D) dentro la regex del dominio
     "lavoro" in strumenti/costruisci.py. Una
     parola scritta in due alfabeti non si trova con nessuna ricerca, e
     nessuno si accorge che il dominio non viene mai assegnato. */
  const INGANNEVOLI = /[\u0400-\u04FF\u0370-\u03FF]/;
  const sporchi = file.filter(f => INGANNEVOLI.test(fsm.readFileSync(pth.join(radiceProg, f), 'utf8')));
  ok('nessuna lettera cirillica o greca in nessun sorgente', sporchi.length === 0, sporchi);

  // I diacritici combinanti letterali sono invisibili nell'editor: solo escape.
  const combinantiNudi = file.filter(f => {
    const t = fsm.readFileSync(pth.join(radiceProg, f), 'utf8');
    return /[\u0300-\u036f]/.test(t.replace(/[\u00C0-\u017F]/g, ''));
  });
  ok('nessun diacritico combinante nudo nel sorgente', combinantiNudi.length === 0, combinantiNudi);

  // Forma decomposta: "Gia" + accento si vede come "Già" ma non si trova
  // cercando "Già", perche' sono sequenze di byte diverse.
  const decomposti = file.filter(f => {
    const t = fsm.readFileSync(pth.join(radiceProg, f), 'utf8');
    return t !== t.normalize('NFC');
  });
  ok('tutto il sorgente e\' in forma composta (NFC)', decomposti.length === 0, decomposti);
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

gruppo('Verbi irregolari nel controllo delle frasi');
{
  /* Il controllo della frase e' l'unico punto in cui chi usa l'app produce
     qualcosa. Rifiutare una frase corretta e' il difetto piu' caro che
     questo codice possa avere: dice "hai sbagliato" a chi ha ragione.

     La radice ricavata dall'infinito non regge gli irregolari: "imposto"
     non contiene "imporr". Il campo `forme` del corpus copriva 5 voci su
     13.589, contro 2.572 verbi. */
  const deveAccettare = [
    ['supporre', 'Ho supposto il contrario'],
    ['supporre', 'Suppongo che non verra\''],
    ['imporre', 'Gli hanno imposto il silenzio'],
    ['deporre', 'I soldati deposero i loro zaini'],
    ['predisporre', 'I contadini predispongono i campi per la semina'],
    ['opporsi', 'Si oppose a quanto era sbagliato'],
    ['sottoporsi', 'Mi sono sottoposto al trattamento'],
    ['ritrarre', 'Il soldato ritrasse la pistola'],
    ['ritrarre', 'Il pittore ritrae il volto di sua madre'],
    ['detrarre', 'Le tasse sono gia\' detratte'],
    ['ridurre', 'Il costo e\' stato ridotto della meta\''],
    ['sedurre', 'Si lascio\' sedurre dalla promessa'],
    ['eludere', 'Ha eluso la domanda cambiando argomento'],
    ['persuadere', 'Mi ha persuaso in cinque minuti'],
    ['esimersi', 'Non posso esimermi dal dirle come stanno le cose'],
    ['figuraccia', 'Inconsapevole delle continue figuracce che faceva'],
    // i regolari devono continuare a funzionare come prima
    ['blandire', 'Il candidato blandiva la platea'],
    ['blandire', 'Ha blandito tutti'],
    ['procrastinare', 'Ha procrastinato la decisione'],
    ['acume', 'Ha analizzato il caso con raro acume']
  ];
  const rifiutati = deveAccettare.filter(function (c) {
    return C.lemma(c[0]) && !R.contiene(c[1], c[0]);
  });
  ok('accetta le forme irregolari di ogni famiglia', rifiutati.length === 0,
     rifiutati.map(c => c[0] + ' | ' + c[1] + ' | ' + JSON.stringify(R.radici(c[0]))));

  /* Un falso accetto costa poco: l'app dichiara gia' di non saper giudicare
     se la parola sia usata bene. Un falso rifiuto costa la fiducia. Ma i
     temi troppo corti prendono mezza lingua, e vanno tenuti fuori: "tra"
     ricavato da "contrarre" copriva l'intero prefisso contra-, 36 lemmi del
     corpus da "contraccezione" a "contrafforte". */
  const deveRifiutare = [
    ['tedio', 'il tedesco parla piano'],
    ['blandire', 'una cosa bianca sul tavolo'],
    ['imporre', 'ha comprato il posto in prima fila'],
    ['eludere', 'la luce e\' fioca'],
    ['ridurre', 'il conduttore ha parlato a lungo'],
    ['contrarre', 'la contraccezione e\' un tema delicato'],
    ['estrarre', 'preferisce estraniarsi dal gruppo'],
    ['spingere', 'il pinguino nuota veloce']
  ];
  const accettati = deveRifiutare.filter(function (c) {
    return C.lemma(c[0]) && R.contiene(c[1], c[0]);
  });
  ok('non accetta parole che somigliano soltanto', accettati.length === 0,
     accettati.map(c => c[0] + ' | ' + c[1] + ' | ' + JSON.stringify(R.radici(c[0]))));

  ok('nessun tema derivato scende sotto i quattro caratteri',
     L.every(x => R.derivate(x.id).every(t => t.length >= 4)),
     L.filter(x => R.derivate(x.id).some(t => t.length < 4)).slice(0, 3).map(x => x.id));

  /* Le misure sull'intero corpus - quanti verbi le famiglie coprono, quanti
     esempi restano incoerenti - stanno in test/dati.js, che carica tutti e
     64 i blocchi: qui ce ne sono otto, e il campione direbbe poco. */

  ok('le radici non contengono doppioni',
     L.slice(0, 500).every(x => { const r = R.radici(x.id); return new Set(r).size === r.length; }));
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
