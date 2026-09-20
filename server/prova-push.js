/* Collaudo della cifratura contro il vettore pubblicato nell'RFC 8291,
 * sezione 5 e appendice A. Un round-trip con se stessi proverebbe soltanto
 * la coerenza interna: questo prova la conformita' allo standard. */
'use strict';
const assert = require('assert');
const P = require('./push');

let ok = 0, ko = 0;
function prova(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  FALL ' + nome + (extra !== undefined ? '  -> ' + extra : '')); }
}

// --- ingressi dell'RFC ---
const V = {
  chiaro: 'When I grow up, I want to be a watermelon',
  asPubblica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivata: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPubblica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivata: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  sale: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  atteso: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
          'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
          'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

console.log('\nCifratura contro il vettore dell\'RFC 8291');
const corpo = P.cifra(V.chiaro, V.uaPubblica, V.auth,
  { asPrivata: V.asPrivata, sale: V.sale });
prova('il corpo cifrato coincide byte per byte con l\'RFC',
  P.b64u(corpo) === V.atteso, P.b64u(corpo).slice(0, 48) + '...');
// L'esempio dell'RFC dichiara Content-Length: 145, ma il corpo che stampa
// subito sotto (192 caratteri base64url) decodifica a 144 byte. Fa fede il
// corpo, con cui il nostro output coincide: l'intestazione e' sbagliata di uno.
prova('lunghezza 144 byte, quanti ne decodifica il corpo stampato nell\'RFC',
  corpo.length === 144, corpo.length);
prova('il corpo dell\'RFC decodifica davvero a 144 byte',
  P.dab64u(V.atteso).length === 144, P.dab64u(V.atteso).length);
prova('l\'intestazione riporta il sale', P.b64u(corpo.slice(0, 16)) === V.sale);
prova('la dimensione del record e\' 4096', corpo.readUInt32BE(16) === 4096);
prova('la chiave effimera e\' lunga 65 byte', corpo[20] === 65);
prova('la chiave effimera e\' quella del mittente',
  P.b64u(corpo.slice(21, 86)) === V.asPubblica);

console.log('\nChiavi diverse ogni volta');
const a = P.cifra('ciao', V.uaPubblica, V.auth);
const b = P.cifra('ciao', V.uaPubblica, V.auth);
prova('due cifrature dello stesso testo differiscono', !a.equals(b));
prova('il sale e\' casuale', !a.slice(0, 16).equals(b.slice(0, 16)));

console.log('\nIngressi non validi');
for (const [nome, fn] of [
  ['chiave del browser troppo corta', () => P.cifra('x', P.b64u(Buffer.alloc(10)), V.auth)],
  ['segreto di autenticazione sbagliato', () => P.cifra('x', V.uaPubblica, P.b64u(Buffer.alloc(8)))],
]) {
  let lanciato = false;
  try { fn(); } catch (e) { lanciato = true; }
  prova('rifiuta: ' + nome, lanciato);
}

console.log('\nVAPID (RFC 8292)');
const chiavi = P.generaChiavi();
prova('genera una chiave pubblica di 65 byte', P.dab64u(chiavi.pubblica).length === 65);
prova('genera una chiave privata di 32 byte', P.dab64u(chiavi.privata).length === 32);
const h = P.intestazioneVapid('https://fcm.googleapis.com/fcm/send/abc', 'mailto:a@b.it', chiavi);
prova('produce un\'intestazione Authorization', /^vapid t=.+, k=.+$/.test(h.Authorization));
const jwt = h.Authorization.match(/t=([^,]+)/)[1].split('.');
prova('il JWT ha tre parti', jwt.length === 3);
const testa = JSON.parse(P.dab64u(jwt[0]));
const carico = JSON.parse(P.dab64u(jwt[1]));
prova('algoritmo ES256', testa.alg === 'ES256' && testa.typ === 'JWT');
prova('destinatario = origine del servizio push', carico.aud === 'https://fcm.googleapis.com');
prova('la scadenza e\' nel futuro e sotto le 24 ore',
  carico.exp > Date.now() / 1000 && carico.exp < Date.now() / 1000 + 86400);
prova('la firma e\' grezza r||s di 64 byte', P.dab64u(jwt[2]).length === 64);

// la firma deve verificare con la chiave pubblica dichiarata
const crypto = require('crypto');
const pub = P.dab64u(chiavi.pubblica);
const verifica = crypto.verify('sha256', Buffer.from(jwt[0] + '.' + jwt[1]), {
  key: crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
    x: P.b64u(pub.slice(1, 33)), y: P.b64u(pub.slice(33, 65)) } }),
  dsaEncoding: 'ieee-p1363',
}, P.dab64u(jwt[2]));
prova('la firma verifica con la chiave dichiarata in k=', verifica);

console.log('\n' + (ko === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') + ' - ' + ok + ' passate, ' + ko + ' fallite\n');
process.exit(ko ? 1 : 0);
