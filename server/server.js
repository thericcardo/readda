#!/usr/bin/env node
/* Readda - server.
 *
 * Fa due cose sole: serve i file dell'app e manda i promemoria push. Nessuna
 * dipendenza, nessun database: un file JSON e il modulo crypto di Node.
 *
 *   node server/server.js --porta 8080
 *
 * Alla prima esecuzione genera le chiavi VAPID in dati/chiavi.json e le
 * stampa. Se preferisci passarle dall'ambiente:
 *   VAPID_PUBBLICA=... VAPID_PRIVATA=... VAPID_SOGGETTO=mailto:tu@esempio.it
 *
 * Cosa sa di chi lo usa: nickname, iscrizione push del browser, e quando
 * scadono le sue parole con il lemma da chiedere. Niente email, niente
 * password, nessuna traccia di cosa scrive nelle frasi.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const Push = require('./push');
const Archivio = require('./archivio');
const Scadenze = require('./scadenze');

const RADICE = path.dirname(__dirname);
const DATI = path.join(RADICE, 'dati-server');

/* ------------------------------------------------------- impostazioni */
function argomento(nome, difetto) {
  const i = process.argv.indexOf('--' + nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : difetto;
}

const PORTA = parseInt(argomento('porta', process.env.PORT || '8080'), 10);
const SOGGETTO = process.env.VAPID_SOGGETTO || argomento('soggetto', 'mailto:readda@example.org');
const INTERVALLO = parseInt(argomento('intervallo', '60'), 10) * 1000;

function chiaviVapid() {
  if (process.env.VAPID_PUBBLICA && process.env.VAPID_PRIVATA) {
    return { pubblica: process.env.VAPID_PUBBLICA, privata: process.env.VAPID_PRIVATA };
  }
  const f = path.join(DATI, 'chiavi.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    const nuove = Push.generaChiavi();
    fs.mkdirSync(DATI, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(nuove, null, 1), { mode: 0o600 });
    console.log('\nGenerate nuove chiavi VAPID in ' + f);
    console.log('  pubblica: ' + nuove.pubblica);
    console.log('  Conservale: cambiarle invalida tutte le iscrizioni esistenti.\n');
    return nuove;
  }
}

/* ------------------------------------------------------- file statici */
const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

function serviFile(percorsoRichiesto, res) {
  let rel = decodeURIComponent(percorsoRichiesto.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const assoluto = path.join(RADICE, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  // niente uscite dalla cartella del progetto
  if (!assoluto.startsWith(RADICE + path.sep) && assoluto !== RADICE) {
    res.writeHead(403).end('vietato');
    return;
  }
  fs.readFile(assoluto, (err, corpo) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('non trovato'); return; }
    const est = path.extname(assoluto).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TIPI[est] || 'application/octet-stream',
      // i blocchi del corpus sono immutabili finche' non si rigenerano
      'Cache-Control': /blocco-\d+\.js$/.test(assoluto) ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(corpo);
  });
}

/* ------------------------------------------------------------- utili */
function leggiCorpo(req, limite) {
  return new Promise((risolvi, rifiuta) => {
    let pezzi = '', misura = 0;
    req.on('data', (c) => {
      misura += c.length;
      if (misura > (limite || 64 * 1024)) { rifiuta(new Error('corpo troppo grande')); req.destroy(); return; }
      pezzi += c;
    });
    req.on('end', () => {
      try { risolvi(pezzi ? JSON.parse(pezzi) : {}); }
      catch (e) { rifiuta(new Error('JSON non valido')); }
    });
    req.on('error', rifiuta);
  });
}

function rispondi(res, stato, oggetto) {
  const corpo = JSON.stringify(oggetto);
  res.writeHead(stato, { 'Content-Type': 'application/json; charset=utf-8',
                         'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
}

function iscrizioneValida(i) {
  if (!i || typeof i.endpoint !== 'string') return 'iscrizione senza endpoint';
  let u;
  try { u = new URL(i.endpoint); } catch (e) { return 'endpoint non e\' un indirizzo'; }
  if (u.protocol !== 'https:') return 'l\'endpoint deve essere https';
  if (!i.keys || typeof i.keys.p256dh !== 'string' || typeof i.keys.auth !== 'string') {
    return 'mancano le chiavi del browser';
  }
  try {
    if (Push.dab64u(i.keys.p256dh).length !== 65) return 'chiave p256dh di lunghezza sbagliata';
    if (Push.dab64u(i.keys.auth).length !== 16) return 'segreto auth di lunghezza sbagliata';
  } catch (e) { return 'chiavi non decodificabili'; }
  return null;
}

function scadenzeValide(s) {
  if (!Array.isArray(s)) return 'le scadenze devono essere un elenco';
  if (s.length > 500) return 'troppe scadenze';
  for (const v of s) {
    if (!v || typeof v.quando !== 'number' || !isFinite(v.quando)) return 'scadenza senza data';
    if (typeof v.lemma !== 'string' || v.lemma.length > 40) return 'lemma non valido';
    if (v.tipo !== 'produzione' && v.tipo !== 'riconoscimento') return 'tipo non valido';
  }
  return null;
}

/* ------------------------------------------------- limite di frequenza */
const colpi = new Map();
function troppiTentativi(ip) {
  const adesso = Date.now();
  const riga = colpi.get(ip) || { n: 0, da: adesso };
  if (adesso - riga.da > 60e3) { riga.n = 0; riga.da = adesso; }
  riga.n += 1;
  colpi.set(ip, riga);
  if (colpi.size > 5000) colpi.clear();
  return riga.n > 60;
}

/* ================================================================ avvio */
function avvia(opzioni) {
  opzioni = opzioni || {};
  const chiavi = opzioni.chiavi || chiaviVapid();
  const archivio = new Archivio(opzioni.archivio || path.join(DATI, 'utenti.json'));
  const inviaPush = opzioni.invia || ((iscr, testo) =>
    Push.invia(iscr, testo, chiavi, { soggetto: SOGGETTO, ttl: 6 * 3600 }));

  const server = http.createServer(async (req, res) => {
    const via = url.parse(req.url).pathname;
    const ip = req.socket.remoteAddress || '?';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (!via.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { rispondi(res, 405, { errore: 'metodo non ammesso' }); return; }
      serviFile(req.url, res);
      return;
    }

    if (troppiTentativi(ip)) { rispondi(res, 429, { errore: 'troppe richieste' }); return; }

    try {
      if (via === '/api/chiave' && req.method === 'GET') {
        rispondi(res, 200, { chiave: chiavi.pubblica });
        return;
      }

      if (via === '/api/iscrizione' && req.method === 'POST') {
        const c = await leggiCorpo(req);
        const nick = String(c.nick || '').trim();
        if (!nick || nick.length > 24) { rispondi(res, 400, { errore: 'nickname non valido' }); return; }
        const guaio = iscrizioneValida(c.iscrizione);
        if (guaio) { rispondi(res, 400, { errore: guaio }); return; }

        const esistente = archivio.utente(nick);
        // chi c'e' gia' deve dimostrare di essere lo stesso, altrimenti
        // chiunque indovini un nickname puo' dirottarne i promemoria
        if (esistente && c.gettone !== esistente.gettone) {
          rispondi(res, 403, { errore: 'questo nickname e\' gia\' iscritto da un altro dispositivo' });
          return;
        }
        const u = archivio.iscrivi(nick, c.iscrizione);
        if (typeof c.fuso === 'number' && Math.abs(c.fuso) <= 900) u.fuso = c.fuso;
        if (Array.isArray(c.scadenze) && !scadenzeValide(c.scadenze)) {
          u.scadenze = Scadenze.potaScadenze(c.scadenze);
        }
        archivio.sporca();
        rispondi(res, 200, { ok: true, gettone: u.gettone });
        return;
      }

      if (via === '/api/scadenze' && req.method === 'POST') {
        const c = await leggiCorpo(req);
        const u = archivio.utente(c.nick);
        if (!u) { rispondi(res, 404, { errore: 'non iscritto' }); return; }
        if (c.gettone !== u.gettone) { rispondi(res, 403, { errore: 'gettone sbagliato' }); return; }
        const guaio = scadenzeValide(c.scadenze);
        if (guaio) { rispondi(res, 400, { errore: guaio }); return; }
        archivio.aggiornaScadenze(c.nick, Scadenze.potaScadenze(c.scadenze));
        if (typeof c.fuso === 'number' && Math.abs(c.fuso) <= 900) { u.fuso = c.fuso; archivio.sporca(); }
        rispondi(res, 200, { ok: true, quante: u.scadenze.length });
        return;
      }

      if (via === '/api/iscrizione' && req.method === 'DELETE') {
        const c = await leggiCorpo(req);
        const u = archivio.utente(c.nick);
        if (!u) { rispondi(res, 200, { ok: true }); return; }
        if (c.gettone !== u.gettone) { rispondi(res, 403, { errore: 'gettone sbagliato' }); return; }
        archivio.dimentica(c.nick);
        rispondi(res, 200, { ok: true });
        return;
      }

      rispondi(res, 404, { errore: 'via sconosciuta' });
    } catch (e) {
      rispondi(res, 400, { errore: e.message });
    }
  });

  /* --------------------------------------------------- il pianificatore */
  async function giro(adesso) {
    adesso = adesso || Date.now();
    let mandati = 0, scadute = 0;
    for (const u of archivio.tutti()) {
      const m = Scadenze.daSvegliare(u, adesso);
      if (!m) continue;
      try {
        const esito = await inviaPush(u.iscrizione,
          JSON.stringify({ titolo: m.titolo, corpo: m.corpo, rotta: m.rotta }));
        if (esito && esito.scaduta) {
          // il browser ha revocato l'iscrizione: tenerla e' solo rumore
          archivio.dimentica(u.nick); scadute++;
        } else if (esito && esito.stato >= 200 && esito.stato < 300) {
          u.ultimoInvio = adesso;
          u.scadenze = Scadenze.potaScadenze(u.scadenze, adesso)
            .filter((s) => s.lemma !== m.lemma);
          archivio.sporca();
          mandati++;
        }
      } catch (e) {
        // una rete che cade non deve fermare il giro per tutti gli altri
      }
    }
    return { mandati, scadute };
  }

  let timer = null;
  function apri() {
    return new Promise((risolvi) => {
      server.listen(PORTA === 0 || opzioni.porta === 0 ? 0 : (opzioni.porta || PORTA), () => {
        if (!opzioni.senzaTimer) {
          timer = setInterval(() => giro().catch(() => {}), opzioni.intervallo || INTERVALLO);
          if (timer.unref) timer.unref();
        }
        risolvi(server.address().port);
      });
    });
  }
  function chiudi() {
    if (timer) clearInterval(timer);
    archivio.chiudi();
    return new Promise((r) => server.close(r));
  }

  return { server, archivio, chiavi, giro, apri, chiudi };
}

if (require.main === module) {
  const app = avvia();
  app.apri().then((porta) => {
    console.log('Readda in ascolto su http://localhost:' + porta);
    console.log('Chiave VAPID pubblica: ' + app.chiavi.pubblica);
    console.log('Controllo delle scadenze ogni ' + (INTERVALLO / 1000) + 's');
  });
  process.on('SIGINT', () => { app.chiudi().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { app.chiudi().then(() => process.exit(0)); });
}

module.exports = { avvia };
