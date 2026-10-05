/* Collaudo di API e pianificatore. Nessun push parte davvero: l'invio e'
 * sostituito da una finta che registra cosa sarebbe uscito. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { avvia } = require('./server');
const Scadenze = require('./scadenze');
const Push = require('./push');

let ok = 0, ko = 0;
function p(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  FALL ' + nome + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

const ISCRIZIONE = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/finta-abc',
  keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
};

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'readda-'));
  const inviati = [];
  let prossimoEsito = { stato: 201 };

  const app = avvia({
    porta: 0,
    archivio: path.join(tmp, 'utenti.json'),
    chiavi: Push.generaChiavi(),
    senzaTimer: true,
    invia: async (iscr, testo) => { inviati.push({ iscr, testo }); return prossimoEsito; },
  });
  const porta = await app.apri();
  const base = 'http://127.0.0.1:' + porta;

  const chiama = async (via, metodo, corpo) => {
    const r = await fetch(base + via, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let d = null;
    try { d = await r.json(); } catch (e) {}
    return { stato: r.status, dati: d };
  };

  gruppo('File statici');
  const home = await fetch(base + '/index.html');
  p('serve la pagina', home.status === 200 && (await home.text()).includes('Readda'));
  const blocco = await fetch(base + '/data/blocco-00.js');
  p('serve un blocco del corpus', blocco.status === 200);
  p('i blocchi sono messi in cache a lungo',
    /max-age=86400/.test(blocco.headers.get('cache-control')), blocco.headers.get('cache-control'));
  const fuga = await fetch(base + '/../../etc/passwd');
  p('non si esce dalla cartella del progetto', fuga.status === 404 || fuga.status === 403, fuga.status);

  /* dati-server/ sta DENTRO la radice del progetto, quindi la guardia qui
   * sopra - che vieta solo di uscirne - non lo fermava: chiavi.json con la
   * chiave privata VAPID e utenti.json con endpoint, chiavi e gettoni di ogni
   * iscritto erano leggibili da chiunque conoscesse il percorso. Su localhost
   * non si vedeva; ospitato, bastava chiederlo.
   *
   * L'asserzione e' su 403 e non su «diverso da 200» apposta: senza guardia
   * un file assente risponde 404, e una prova contenta del 404 passerebbe
   * anche col difetto dentro. Per questo ce n'e' anche una su un file che
   * esiste davvero. */
  const spia = path.join(path.dirname(__dirname), 'dati-server', 'prova-spia.json');
  fs.mkdirSync(path.dirname(spia), { recursive: true });
  fs.writeFileSync(spia, '{"privata":"non-deve-uscire"}');
  try {
    const chiavi = await fetch(base + '/dati-server/chiavi.json');
    p('la chiave privata non e\' servita', chiavi.status === 403, chiavi.status);
    const utenti = await fetch(base + '/dati-server/utenti.json');
    p('l\'archivio degli iscritti non e\' servito', utenti.status === 403, utenti.status);
    const vista = await fetch(base + '/dati-server/prova-spia.json');
    const corpo = await vista.text();
    p('nemmeno un file di dati-server che esiste davvero',
      vista.status === 403 && corpo.indexOf('non-deve-uscire') === -1, vista.status);
    const sorgente = await fetch(base + '/server/server.js');
    p('il sorgente del server non e\' fra i file dell\'app', sorgente.status === 403, sorgente.status);
  } finally {
    fs.rmSync(spia, { force: true });
  }

  gruppo('Chiave pubblica');
  const k = await chiama('/api/chiave', 'GET');
  p('restituisce la chiave VAPID', k.stato === 200 && Push.dab64u(k.dati.chiave).length === 65);

  gruppo('Iscrizione');
  let r = await chiama('/api/iscrizione', 'POST', { nick: '', iscrizione: ISCRIZIONE });
  p('rifiuta il nickname vuoto', r.stato === 400);
  r = await chiama('/api/iscrizione', 'POST', { nick: 'Ric', iscrizione: { endpoint: 'http://x.it', keys: ISCRIZIONE.keys } });
  p('rifiuta un endpoint non https', r.stato === 400, r.dati);
  r = await chiama('/api/iscrizione', 'POST', { nick: 'Ric', iscrizione: { endpoint: 'https://x.it', keys: { p256dh: 'AAAA', auth: 'BBBB' } } });
  p('rifiuta chiavi di lunghezza sbagliata', r.stato === 400, r.dati);

  r = await chiama('/api/iscrizione', 'POST', { nick: 'Ric', iscrizione: ISCRIZIONE, fuso: 120 });
  p('accetta un\'iscrizione valida', r.stato === 200 && !!r.dati.gettone);
  const gettone = r.dati.gettone;

  r = await chiama('/api/iscrizione', 'POST', { nick: 'ric', iscrizione: ISCRIZIONE });
  p('senza gettone non si dirotta un nickname gia\' iscritto', r.stato === 403, r.dati);
  r = await chiama('/api/iscrizione', 'POST', { nick: 'ric', iscrizione: ISCRIZIONE, gettone: gettone });
  p('col gettone giusto si puo\' riaggiornare', r.stato === 200);

  /* La lista dei servizi push. Una lista di host ammessi prima o poi sbaglia,
   * perche' i browser ne aggiungono: la scelta non e' se sbagliare, ma come.
   * Rifiutare dicendo quale host era si vede subito - lo legge chi si iscrive
   * e lo scrive il registro del server; accettare e non consegnare mai non lo
   * scopre nessuno, ed e' il guasto peggiore per un'app di promemoria. */
  let quanti = 0;
  const conEndpoint = (e) => ({ nick: 'Servizio' + (++quanti),
                                iscrizione: { endpoint: e, keys: ISCRIZIONE.keys } });
  for (const [nome, e] of [
    ['Chrome, Edge, Opera, Samsung', 'https://fcm.googleapis.com/fcm/send/abc'],
    ['Firefox', 'https://updates.push.services.mozilla.com/wpush/v2/abc'],
    ['Safari', 'https://web.push.apple.com/abc'],
    ['Edge EdgeHTML', 'https://wns2-by3p.notify.windows.com/w/?token=abc'],
  ]) {
    const rs = await chiama('/api/iscrizione', 'POST', conEndpoint(e));
    p('accetta il servizio push di ' + nome, rs.stato === 200, rs.dati);
  }

  /* Il confine dei sottodomini: `.push.services.mozilla.com` deve prendere
   * updates.push.services.mozilla.com e NON xpush.services.mozilla.com, che e'
   * un dominio di qualcun altro con lo stesso finale. */
  r = await chiama('/api/iscrizione', 'POST', conEndpoint('https://xpush.services.mozilla.com/abc'));
  p('un suffisso non basta: serve il confine di etichetta', r.stato === 400, r.dati);

  r = await chiama('/api/iscrizione', 'POST', conEndpoint('https://un-host-qualunque.example/xyz'));
  p('rifiuta un host che non e\' un servizio push', r.stato === 400, r.dati);
  p('e dice quale host era, cosi\' si puo\' aggiungere',
    !!r.dati && typeof r.dati.errore === 'string'
    && r.dati.errore.indexOf('un-host-qualunque.example') !== -1, r.dati);

  /* L'appiglio: la lista invecchia, e chi ospita deve poterla allungare senza
   * aspettare una versione nuova. */
  const conExtra = avvia({
    porta: 0,
    archivio: path.join(tmp, 'utenti-extra.json'),
    chiavi: Push.generaChiavi(),
    senzaTimer: true,
    servizi: ['push.mio.example'],
    invia: async () => ({ stato: 201 }),
  });
  const portaE = await conExtra.apri();
  const rx = await fetch('http://127.0.0.1:' + portaE + '/api/iscrizione', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conEndpoint('https://push.mio.example/abc')),
  });
  p('un servizio in piu\' si aggiunge senza toccare il codice', rx.status === 200, rx.status);
  await conExtra.chiudi();

  gruppo('Scadenze');
  const ieri = Date.now() - 36e5;
  r = await chiama('/api/scadenze', 'POST', { nick: 'Ric', gettone: 'sbagliato', scadenze: [] });
  p('gettone sbagliato: rifiutato', r.stato === 403);
  r = await chiama('/api/scadenze', 'POST', { nick: 'Ric', gettone: gettone, scadenze: [{ quando: ieri, lemma: 'blandire', tipo: 'bislacco' }] });
  p('tipo non valido: rifiutato', r.stato === 400, r.dati);
  r = await chiama('/api/scadenze', 'POST', { nick: 'Ric', gettone: gettone,
    scadenze: [{ quando: ieri, lemma: 'blandire', tipo: 'produzione' },
               { quando: ieri, lemma: 'coacervo', tipo: 'riconoscimento' }] });
  p('scadenze valide: accettate', r.stato === 200 && r.dati.quante === 2, r.dati);
  r = await chiama('/api/scadenze', 'POST', { nick: 'Nessuno', gettone: 'x', scadenze: [] });
  p('utente inesistente: 404', r.stato === 404);

  gruppo('Il pianificatore');
  const u = app.archivio.utente('Ric');
  u.fuso = 0;
  const mattina = Date.UTC(2026, 0, 15, 10, 0);   // 10:00
  const notte = Date.UTC(2026, 0, 15, 3, 0);      // 03:00
  u.scadenze = [{ quando: mattina - 36e5, lemma: 'blandire', tipo: 'produzione' },
                { quando: mattina - 72e5, lemma: 'coacervo', tipo: 'riconoscimento' }];

  p('di notte non si sveglia nessuno', Scadenze.daSvegliare(u, notte) === null);
  const m = Scadenze.daSvegliare(u, mattina);
  p('di mattina c\'e\' un messaggio', !!m);
  p('la produzione ha la precedenza sul riconoscimento',
    m && m.lemma === 'blandire', m && m.lemma);
  p('il messaggio e\' una domanda, non un avviso',
    m && /L’hai usata/.test(m.titolo), m && m.titolo);

  u.ultimoInvio = mattina - 36e5;
  p('non piu\' di un promemoria ogni sei ore', Scadenze.daSvegliare(u, mattina) === null);
  delete u.ultimoInvio;

  u.scadenze = [{ quando: mattina - 10 * 24 * 36e5, lemma: 'vecchia', tipo: 'produzione' }];
  p('una scadenza di dieci giorni fa e\' stantia', Scadenze.daSvegliare(u, mattina) === null);
  u.scadenze = [{ quando: mattina + 36e5, lemma: 'futura', tipo: 'produzione' }];
  p('una scadenza futura non sveglia', Scadenze.daSvegliare(u, mattina) === null);

  gruppo('Il giro di invio');
  u.scadenze = [{ quando: mattina - 36e5, lemma: 'blandire', tipo: 'produzione' }];
  delete u.ultimoInvio;
  inviati.length = 0;
  let esito = await app.giro(mattina);
  p('manda un push', esito.mandati === 1 && inviati.length === 1, esito);
  const carico = JSON.parse(inviati[0].testo);
  p('il carico ha titolo, corpo e rotta',
    carico.titolo && carico.corpo && carico.rotta === '#/ripasso', carico);
  p('la parola chiesta esce dalle scadenze',
    !app.archivio.utente('Ric').scadenze.some((s) => s.lemma === 'blandire'));
  esito = await app.giro(mattina);
  p('il giro subito dopo non rimanda niente', esito.mandati === 0);

  gruppo('Iscrizione revocata dal browser');
  u.scadenze = [{ quando: mattina - 36e5, lemma: 'coacervo', tipo: 'produzione' }];
  delete u.ultimoInvio;
  prossimoEsito = { stato: 410, scaduta: true };
  esito = await app.giro(mattina);
  p('una 410 cancella l\'iscrizione', esito.scadute === 1 && !app.archivio.utente('Ric'), esito);

  gruppo('Persistenza');
  prossimoEsito = { stato: 201 };
  await chiama('/api/iscrizione', 'POST', { nick: 'Altro', iscrizione: ISCRIZIONE });
  app.archivio.salvaSeSporco();
  const suDisco = JSON.parse(fs.readFileSync(path.join(tmp, 'utenti.json'), 'utf8'));
  p('l\'utente e\' finito su disco', !!suDisco.utenti.altro);
  p('su disco non c\'e\' traccia di frasi scritte',
    !JSON.stringify(suDisco).includes('frase'));

  gruppo('Cancellazione');
  const g2 = (await chiama('/api/iscrizione', 'POST', { nick: 'Altro', iscrizione: ISCRIZIONE,
    gettone: suDisco.utenti.altro.gettone })).dati.gettone;
  r = await chiama('/api/iscrizione', 'DELETE', { nick: 'Altro', gettone: 'no' });
  p('non si cancella senza gettone', r.stato === 403);
  r = await chiama('/api/iscrizione', 'DELETE', { nick: 'Altro', gettone: g2 });
  p('col gettone si cancella', r.stato === 200 && !app.archivio.utente('Altro'));

  /* Dietro un proxy, req.socket.remoteAddress e' l'indirizzo del proxy:
   * uguale per tutti, quindi il limite diventerebbe uno solo per il mondo
   * intero e una persona rumorosa chiuderebbe fuori le altre. Fidarsi di
   * X-Forwarded-For a scatola chiusa sarebbe pero' peggio - chiunque puo'
   * scriverlo e saltare il limite del tutto - quindi l'intestazione si guarda
   * solo quando lo dice una variabile d'ambiente, che il cliente non puo'
   * toccare. */
  /* ------------------------------------------------ il tetto dell'archivio
   * Senza tetto l'archivio cresce all'infinito: basta un endpoint
   * fcm.googleapis.com sintatticamente valido e un nickname mai visto.
   *
   * Ma un tetto nudo sarebbe peggio del problema. Chi vuole fare danno
   * riempie i posti in pochi minuti, e da quel momento nessuna persona vera
   * riesce piu' a iscriversi: da crescita lenta e visibile a blocco totale e
   * immediato. Serve quindi distinguere la spazzatura da una persona, e la
   * forma che la spazzatura prende e' precisa - vedi `abbandonato`. */
  gruppo('Chi e\' abbandonato e chi no');
  const GIORNO = 24 * 36e5;
  const ora = Date.UTC(2026, 5, 1, 12, 0);
  const vuoto = (patch) => Object.assign(
    { nick: 'X', iscrizione: ISCRIZIONE, scadenze: [], aggiornato: ora - 40 * GIORNO }, patch);

  p('mai svegliato, senza scadenze, fermo da 40 giorni',
    Scadenze.abbandonato(vuoto(), ora, 30) === true);
  p('toccato ieri non e\' abbandonato',
    Scadenze.abbandonato(vuoto({ aggiornato: ora - GIORNO }), ora, 30) === false);
  /* Con una scadenza il pianificatore lo guarda, gli manda un push, e se
   * l'endpoint e' finto il 404 lo cancella da solo: non tocca a questa
   * potatura. */
  p('con una scadenza da aspettare non e\' abbandonato',
    Scadenze.abbandonato(
      vuoto({ scadenze: [{ quando: ora, lemma: 'x', tipo: 'produzione' }] }), ora, 30) === false);
  p('chi ha gia\' ricevuto un promemoria non e\' abbandonato',
    Scadenze.abbandonato(vuoto({ ultimoInvio: ora - 40 * GIORNO }), ora, 30) === false);

  gruppo('Il tetto dell\'archivio');
  const conTetto = (opz) => avvia(Object.assign({
    porta: 0,
    chiavi: Push.generaChiavi(),
    senzaTimer: true,
    dietroProxy: true,
    invia: async () => ({ stato: 201 }),
  }, opz));

  /* dietroProxy + un indirizzo finto diverso: ogni istanza ha il suo secchio
   * del limite di frequenza, e queste prove non spendono quello condiviso. */
  const iscriviSu = (base, finto, nick, gett) => fetch(base + '/api/iscrizione', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Fly-Client-IP': finto },
    body: JSON.stringify({ nick: nick, iscrizione: ISCRIZIONE, gettone: gett }),
  });

  const pieno = conTetto({ archivio: path.join(tmp, 'utenti-tetto.json'), maxIscritti: 2 });
  const basePieno = 'http://127.0.0.1:' + (await pieno.apri());
  const primo = await iscriviSu(basePieno, '198.51.100.10', 'Uno');
  p('il primo entra', primo.status === 200);
  const gettonePrimo = (await primo.json()).gettone;
  p('il secondo entra', (await iscriviSu(basePieno, '198.51.100.10', 'Due')).status === 200);
  const terzo = await iscriviSu(basePieno, '198.51.100.10', 'Tre');
  const dettoTerzo = await terzo.json();
  p('il terzo trova il server al completo', terzo.status === 503, terzo.status);
  p('e il rifiuto dice qual e\' il tetto',
    typeof dettoTerzo.errore === 'string' && dettoTerzo.errore.indexOf('2') !== -1, dettoTerzo);
  /* Chi c'e' gia' non resta chiuso fuori dal tetto: aggiornarsi non e'
   * iscriversi. Col gettone, perche' senza sarebbe 403 per la protezione
   * contro chi indovina un nickname - che e' un'altra cosa e viene prima. */
  p('chi e\' gia\' dentro continua ad aggiornarsi ad archivio pieno',
    (await iscriviSu(basePieno, '198.51.100.10', 'Uno', gettonePrimo)).status === 200);
  await pieno.chiudi();

  /* La prova che dice se il disegno vale qualcosa: con due posti occupati da
   * record abbandonati, una persona vera deve entrare lo stesso. Con un tetto
   * nudo qui ci sarebbe un 503. */
  const conSpazzatura = conTetto({ archivio: path.join(tmp, 'utenti-spazzatura.json'), maxIscritti: 2 });
  const baseSpazz = 'http://127.0.0.1:' + (await conSpazzatura.apri());
  await iscriviSu(baseSpazz, '198.51.100.11', 'Finto1');
  await iscriviSu(baseSpazz, '198.51.100.11', 'Finto2');
  for (const u of conSpazzatura.archivio.tutti()) u.aggiornato = Date.now() - 40 * GIORNO;
  const vera = await iscriviSu(baseSpazz, '198.51.100.11', 'Persona');
  p('un posto occupato da spazzatura si libera per una persona vera',
    vera.status === 200, vera.status);
  p('e la spazzatura e\' sparita davvero',
    !conSpazzatura.archivio.utente('Finto1') && !conSpazzatura.archivio.utente('Finto2'),
    conSpazzatura.archivio.tutti().map((u) => u.nick));
  await conSpazzatura.chiudi();

  /* Il giro periodico fa la stessa pulizia senza aspettare che qualcuno si
   * iscriva: un archivio che nessuno guarda non deve gonfiarsi lo stesso. */
  const conGiro = conTetto({ archivio: path.join(tmp, 'utenti-giro.json') });
  const baseGiro = 'http://127.0.0.1:' + (await conGiro.apri());
  await iscriviSu(baseGiro, '198.51.100.12', 'Vecchio');
  await iscriviSu(baseGiro, '198.51.100.12', 'Nuovo');
  conGiro.archivio.utente('Vecchio').aggiornato = Date.now() - 40 * GIORNO;
  await conGiro.giro(Date.now());
  p('il giro toglie l\'abbandonato', !conGiro.archivio.utente('Vecchio'));
  p('e lascia stare chi e\' arrivato adesso', !!conGiro.archivio.utente('Nuovo'));
  await conGiro.chiudi();

  gruppo('Limite di frequenza dietro un proxy');
  const dietro = avvia({
    porta: 0,
    archivio: path.join(tmp, 'utenti-proxy.json'),
    chiavi: Push.generaChiavi(),
    senzaTimer: true,
    dietroProxy: true,
    invia: async () => ({ stato: 201 }),
  });
  const portaD = await dietro.apri();
  const baseD = 'http://127.0.0.1:' + portaD;
  const bussa = (ipFinto) => fetch(baseD + '/api/chiave', { headers: { 'Fly-Client-IP': ipFinto } });

  let fermato = false;
  for (let i = 0; i < 70; i++) {
    if ((await bussa('203.0.113.7')).status === 429) { fermato = true; break; }
  }
  p('un indirizzo rumoroso viene fermato', fermato);
  /* L'asserzione che conta: senza la correzione questa e' 429, perche' le due
   * richieste finiscono nello stesso secchio - quello del socket. */
  const altro = await bussa('203.0.113.99');
  p('un altro indirizzo non paga per lui', altro.status === 200, altro.status);
  await dietro.chiudi();

  gruppo('Limite di frequenza');
  let bloccato = false;
  for (let i = 0; i < 80; i++) {
    const rr = await chiama('/api/chiave', 'GET');
    if (rr.stato === 429) { bloccato = true; break; }
  }
  p('oltre sessanta richieste al minuto si viene fermati', bloccato);

  /* Qui il secchio del socket e' esaurito. Un'intestazione Fly-Client-IP mai
   * vista deve restare 429: se aprisse un secchio nuovo, chiunque salterebbe
   * il limite scrivendosi un indirizzo diverso a ogni richiesta. Senza
   * `dietroProxy` l'intestazione non si guarda, ed e' il punto. */
  const finto = await fetch(base + '/api/chiave', { headers: { 'Fly-Client-IP': '198.51.100.1' } });
  p('senza proxy dichiarato l\'intestazione non fa saltare il limite',
    finto.status === 429, finto.status);

  await app.chiudi();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (ko === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') + ' - ' + ok + ' passate, ' + ko + ' fallite\n');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
