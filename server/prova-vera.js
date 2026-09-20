/* Prova di consegna vera: un Chromium si iscrive al push e il server gli
 * manda un messaggio. Se il servizio push di Google non e' raggiungibile da
 * questa rete, lo dice invece di fingere che sia andata bene. */
'use strict';
const { chromium } = require('playwright');

(async () => {
  const BASE = process.env.BASE || 'http://127.0.0.1:8899';
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--enable-features=PushMessaging'],
  });
  const ctx = await b.newContext({ permissions: ['notifications'] });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

  const esito = await p.evaluate(async (base) => {
    try {
      const k = await (await fetch(base + '/api/chiave')).json();
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const bytes = (s) => {
        const pad = '='.repeat((4 - s.length % 4) % 4);
        const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(raw, (c) => c.charCodeAt(0));
      };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: bytes(k.chiave),
      });
      return { ok: true, iscrizione: sub.toJSON() };
    } catch (e) {
      return { ok: false, errore: String(e && e.message || e) };
    }
  }, BASE);

  if (!esito.ok) {
    console.log('ISCRIZIONE NON RIUSCITA: ' + esito.errore);
    console.log('Il servizio push di Google non e\' raggiungibile da questa rete:');
    console.log('la cifratura e il protocollo restano provati contro il vettore');
    console.log('dell\'RFC 8291, ma la consegna end-to-end va verificata dove');
    console.log('il server sara\' davvero ospitato.');
    await b.close();
    process.exit(2);
  }

  console.log('Iscrizione riuscita.');
  console.log('  endpoint: ' + esito.iscrizione.endpoint.slice(0, 70) + '...');
  const Push = require('./push');
  const chiavi = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'dati-server', 'chiavi.json'), 'utf8'));
  const risposta = await Push.invia(esito.iscrizione,
    JSON.stringify({ titolo: 'L’hai usata, «blandire»?', corpo: 'Scrivi una frase.', rotta: '#/ripasso' }),
    chiavi, { soggetto: 'mailto:readda@example.org' });
  console.log('  risposta del servizio push: ' + risposta.stato + ' ' + risposta.corpo);
  console.log(risposta.stato >= 200 && risposta.stato < 300
    ? '  ACCETTATO: il messaggio e\' stato preso in carico.'
    : '  RIFIUTATO.');
  await b.close();
  process.exit(risposta.stato >= 200 && risposta.stato < 300 ? 0 : 1);
})().catch((e) => { console.error('errore:', e.message); process.exit(2); });
