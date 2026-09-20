/* Readda - Web Push senza dipendenze.
 *
 * Due standard, entrambi obbligatori perche' un push arrivi:
 *   RFC 8291  cifratura del contenuto (aes128gcm, ECDH P-256, HKDF)
 *   RFC 8292  autenticazione del mittente verso il servizio push (VAPID, JWT ES256)
 *
 * Il modulo crypto di Node ha tutto: nessuna libreria esterna, come il resto
 * del progetto. La cifratura e' collaudata contro il vettore di prova
 * pubblicato nell'RFC 8291, non solo contro se stessa.
 */
'use strict';
const crypto = require('crypto');

/* ---------------------------------------------------------- base64url */
function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function dab64u(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/')
    .replace(/\s+/g, ''), 'base64');
}

/* ------------------------------------------------------------- HKDF */
function estrai(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}
function espandi(prk, info, lunghezza) {
  return crypto.createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([1])])).digest().slice(0, lunghezza);
}

/* ------------------------------------------------- chiavi VAPID nuove */
function generaChiavi() {
  const ec = crypto.createECDH('prime256v1');
  ec.generateKeys();
  return { pubblica: b64u(ec.getPublicKey()), privata: b64u(ec.getPrivateKey()) };
}

/* Da chiave grezza a oggetto che Node sa firmare. */
function chiavePrivataDa(privataB64, pubblicaB64) {
  const pub = dab64u(pubblicaB64);          // 0x04 || X(32) || Y(32)
  return crypto.createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC', crv: 'P-256',
      d: b64u(dab64u(privataB64)),
      x: b64u(pub.slice(1, 33)),
      y: b64u(pub.slice(33, 65)),
    },
  });
}

/* -------------------------------------------- VAPID: chi sta scrivendo
 * Il servizio push accetta il messaggio solo se il mittente si firma con
 * la chiave che il browser ha registrato al momento dell'iscrizione. */
function intestazioneVapid(endpoint, soggetto, chiavi, oraScadenza) {
  const origine = new URL(endpoint).origin;
  const scad = oraScadenza || Math.floor(Date.now() / 1000) + 12 * 3600;
  const testa = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const corpo = b64u(JSON.stringify({ aud: origine, exp: scad, sub: soggetto }));
  const firma = crypto.sign('sha256', Buffer.from(testa + '.' + corpo),
    { key: chiavePrivataDa(chiavi.privata, chiavi.pubblica), dsaEncoding: 'ieee-p1363' });
  return {
    Authorization: 'vapid t=' + testa + '.' + corpo + '.' + b64u(firma) +
                   ', k=' + chiavi.pubblica,
  };
}

/* ----------------------------------------------- RFC 8291: cifratura
 * `prova` serve solo al collaudo contro il vettore dell'RFC: in esercizio
 * chiave effimera e sale devono essere casuali a ogni messaggio. */
function cifra(testo, uaPubblicaB64, authB64, prova) {
  const uaPubblica = dab64u(uaPubblicaB64);
  const auth = dab64u(authB64);
  if (uaPubblica.length !== 65 || uaPubblica[0] !== 4) {
    throw new Error('chiave pubblica del browser non valida');
  }
  if (auth.length !== 16) throw new Error('segreto di autenticazione non valido');

  const ec = crypto.createECDH('prime256v1');
  if (prova && prova.asPrivata) ec.setPrivateKey(dab64u(prova.asPrivata));
  else ec.generateKeys();
  const asPubblica = ec.getPublicKey();
  const sale = prova && prova.sale ? dab64u(prova.sale) : crypto.randomBytes(16);

  const segretoEcdh = ec.computeSecret(uaPubblica);

  // combinazione dei due segreti: quello condiviso e quello di autenticazione
  const prkChiave = estrai(auth, segretoEcdh);
  const infoChiave = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'), uaPubblica, asPubblica,
  ]);
  const ikm = espandi(prkChiave, infoChiave, 32);

  const prk = estrai(sale, ikm);
  const cek = espandi(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = espandi(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  // un solo record, quindi il delimitatore di fine e' 0x02
  const chiaro = Buffer.concat([Buffer.from(testo, 'utf8'), Buffer.from([2])]);
  const cifrario = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const cifrato = Buffer.concat([cifrario.update(chiaro), cifrario.final(), cifrario.getAuthTag()]);

  // intestazione RFC 8188: sale | dimensione record | lunghezza id | id | corpo
  const dimensione = Buffer.alloc(4);
  dimensione.writeUInt32BE(4096, 0);
  return Buffer.concat([
    sale, dimensione, Buffer.from([asPubblica.length]), asPubblica, cifrato,
  ]);
}

/* ------------------------------------------------------- invio vero */
function invia(iscrizione, testo, chiavi, opzioni) {
  opzioni = opzioni || {};
  const corpo = cifra(testo, iscrizione.keys.p256dh, iscrizione.keys.auth);
  const intestazioni = Object.assign({
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(corpo.length),
    TTL: String(opzioni.ttl || 86400),
    Urgency: opzioni.urgenza || 'normal',
  }, intestazioneVapid(iscrizione.endpoint, opzioni.soggetto || 'mailto:readda@example.org', chiavi));

  const url = new URL(iscrizione.endpoint);
  const http = url.protocol === 'http:' ? require('http') : require('https');

  return new Promise((risolvi, rifiuta) => {
    const req = http.request({
      method: 'POST', hostname: url.hostname, port: url.port || undefined,
      path: url.pathname + url.search, headers: intestazioni, timeout: 15000,
    }, (res) => {
      let corpoRisposta = '';
      res.on('data', (c) => { corpoRisposta += c; });
      res.on('end', () => risolvi({
        stato: res.statusCode,
        // 404 e 410 vogliono dire che quell'iscrizione non esiste piu'
        scaduta: res.statusCode === 404 || res.statusCode === 410,
        corpo: corpoRisposta.slice(0, 300),
      }));
    });
    req.on('timeout', () => { req.destroy(new Error('tempo scaduto')); });
    req.on('error', rifiuta);
    req.end(corpo);
  });
}

module.exports = { b64u, dab64u, generaChiavi, intestazioneVapid, cifra, invia };
