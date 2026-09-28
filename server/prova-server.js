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
