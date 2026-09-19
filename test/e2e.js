/* Prova end-to-end: guida davvero l'app in Chromium e fotografa le schermate. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8777';
const SCATTI = path.join(__dirname, '..', 'scatti');

let passate = 0, fallite = 0;
function ok(nome, cond, extra) {
  if (cond) { passate++; console.log('  ok   ' + nome); }
  else { fallite++; console.log('  FALL ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function gruppo(n) { console.log('\n' + n); }

(async () => {
  fs.mkdirSync(SCATTI, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'it-IT' });
  const page = await ctx.newPage();

  // quanto pesa davvero la prima apertura: il corpus e' 3,6 MB in 64 blocchi,
  // e all'avvio non deve scaricarsene piu' di una manciata
  const scaricato = { avvio: 0, blocchi: 0, nBlocchi: 0 };
  let avvioFinito = false;
  page.on('response', async r => {
    const u = r.url();
    if (!u.includes('127.0.0.1:8777')) return;
    let n = 0;
    try { n = (await r.body()).length; } catch (e) { return; }
    if (/blocco-\d+\.js/.test(u)) { scaricato.blocchi += n; scaricato.nBlocchi++; }
    else if (!avvioFinito) scaricato.avvio += n;
  });

  const errori = [];
  // le risorse esterne (Google Fonts) possono fallire dietro un proxy:
  // non e' un difetto dell'app, che ha i suoi fallback di sistema
  const esterno = t => /ERR_CERT|ERR_NAME|ERR_INTERNET|fonts\.(googleapis|gstatic)/.test(t);
  page.on('console', m => { if (m.type() === 'error' && !esterno(m.text())) errori.push(m.text()); });
  page.on('pageerror', e => errori.push('pageerror: ' + e.message));

  gruppo('Accesso');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.marchio');
  ok('la schermata di accesso si apre', await page.isVisible('#nick'));
  ok('la barra di navigazione resta nascosta', await page.locator('#barra').isHidden());
  await page.screenshot({ path: path.join(SCATTI, '1-accesso.png') });

  await page.fill('#nick', 'Riccardo');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#cod');
  const codice = (await page.textContent('#cod')).trim();
  ok('mostra il codice di ripristino', /^[a-z]+(-[a-z]+){3}$/.test(codice), codice);
  await page.screenshot({ path: path.join(SCATTI, '2-codice.png') });
  await page.click('#avanti');

  gruppo('Prime tre domande');
  await page.waitForSelector('.avanzamento');
  ok('il pulsante Avanti parte disabilitato', await page.isDisabled('#avanti'));
  await page.click('.scelta[data-v="scuola"]');
  ok('si abilita dopo la scelta', !(await page.isDisabled('#avanti')));
  await page.screenshot({ path: path.join(SCATTI, '3-domande.png') });
  await page.click('#avanti');

  await page.waitForSelector('.scelta[data-v="lingua"]');
  await page.click('.scelta[data-v="lingua"]');
  ok('con un solo interesse resta bloccato', await page.isDisabled('#avanti'));
  await page.click('.scelta[data-v="pensiero"]');
  await page.click('.scelta[data-v="emozioni"]');
  await page.click('#avanti');

  await page.waitForSelector('.scelta[data-v="alto"]');
  await page.click('.scelta[data-v="alto"]');
  await page.click('#avanti');

  gruppo('Peso del corpus');
  ok('l\'avvio scarica meno di 300 KB', scaricato.avvio < 300 * 1024,
     Math.round(scaricato.avvio / 1024) + ' KB');
  const corpus = await page.evaluate(() => ({
    totale: Readda.Corpus.totale(), blocchi: Readda.Corpus.nBlocchi(),
    caricati: Readda.Corpus.quantiCaricati()
  }));
  ok('il corpus dichiara almeno 10.000 voci', corpus.totale >= 10000, corpus);

  gruppo('Flusso');
  await page.waitForSelector('#carta-viva');
  ok('la barra di navigazione compare', await page.locator('#barra').isVisible());
  ok('la carta mostra il lemma', (await page.textContent('.lemma')).length > 2);
  ok('mostra sillabazione e definizione', await page.isVisible('.sillabe') && await page.isVisible('.definizione'));
  ok('ci sono tre azioni', await page.locator('[data-giudizio]').count() === 3);
  const primo = (await page.textContent('#carta-viva .lemma')).trim();
  await page.waitForTimeout(650);   // fine dell'animazione di entrata
  await page.screenshot({ path: path.join(SCATTI, '4-flusso.png') });

  // la carta non deve mai finire sotto i pulsanti o fuori dallo schermo
  const geo = await page.evaluate(() => {
    const c = document.querySelector('#carta-viva').getBoundingClientRect();
    const a = document.querySelector('#azioni').getBoundingClientRect();
    return { cartaBasso: c.bottom, azioniAlto: a.top, cartaAlto: c.top, h: innerHeight };
  });
  ok('la carta non va sotto i pulsanti', geo.cartaBasso <= geo.azioniAlto + 1, geo);
  ok('la carta sta dentro lo schermo', geo.cartaAlto >= 0 && geo.cartaBasso <= geo.h, geo);

  const etichette = await page.evaluate(() => {
    const e = document.querySelector('#carta-viva .etichette');
    const cime = [...e.children].map(c => Math.round(c.getBoundingClientRect().top));
    return { righe: new Set(cime).size, quante: e.children.length };
  });
  ok('le etichette stanno su una riga sola', etichette.righe === 1, etichette);

  await page.click('[data-giudizio="passiva"]');
  await page.waitForTimeout(480);
  const secondo = (await page.textContent('#carta-viva .lemma')).trim();
  ok('la carta avanza dopo il giudizio', primo !== secondo, { primo, secondo });
  ok('la dose si aggiorna', (await page.textContent('#dose-txt')).startsWith('1 /'), await page.textContent('#dose-txt'));

  await page.click('[data-giudizio="ignota"]');
  await page.waitForTimeout(480);
  await page.click('[data-giudizio="attiva"]');
  await page.waitForTimeout(480);

  const dopoFlusso = await page.evaluate(() => Readda.Corpus.quantiCaricati());
  ok('il flusso carica solo pochi blocchi, non tutti', dopoFlusso > 0 && dopoFlusso <= 12, dopoFlusso);
  ok('i blocchi scaricati pesano meno di 1 MB', scaricato.blocchi < 1024 * 1024,
     Math.round(scaricato.blocchi / 1024) + ' KB in ' + scaricato.nBlocchi + ' blocchi');

  gruppo('Scorciatoie da tastiera');
  const primaTasto = (await page.textContent('#carta-viva .lemma')).trim();
  await page.keyboard.press('2');
  await page.waitForTimeout(480);
  ok('il tasto 2 giudica e avanza', (await page.textContent('#carta-viva .lemma')).trim() !== primaTasto);

  gruppo('Navigazione');
  for (const r of ['#/ripasso', '#/collezione', '#/io', '#/feed']) {
    await page.click('.tab[data-rotta="' + r + '"]');
    await page.waitForTimeout(420);
    const st = await page.evaluate(() => ({
      hash: location.hash,
      attive: [...document.querySelectorAll('.tab')].filter(t => t.hasAttribute('aria-current'))
        .map(t => t.dataset.rotta)
    }));
    ok('la scheda attiva segue la rotta ' + r, st.hash === r && st.attive.length === 1 && st.attive[0] === r, st);
  }

  gruppo('Raccolta');
  await page.click('.tab[data-rotta="#/collezione"]');
  await page.waitForSelector('.filtri');
  const vociDaUsare = await page.locator('.voce').count();
  ok('le parole passive sono in lista', vociDaUsare >= 2, vociDaUsare);
  ok('il filtro "Da usare" è quello attivo', await page.getAttribute('.filtro[data-f="passiva"]', 'aria-pressed') === 'true');
  await page.waitForTimeout(400);   // la scheda attiva sfuma in 300ms: prima e' a meta' strada
  const barra = await page.evaluate(() => [...document.querySelectorAll('.tab')].map(t => ({
    r: t.dataset.rotta, c: getComputedStyle(t).color, cur: !!t.getAttribute('aria-current')
  })));
  ok('solo la scheda Raccolta e\' dorata nello scatto',
     barra.filter(t => t.c === 'rgb(255, 216, 95)').length === 1 &&
     barra.find(t => t.r === '#/collezione').c === 'rgb(255, 216, 95)', barra);
  await page.screenshot({ path: path.join(SCATTI, '5-raccolta.png') });

  await page.click('.voce');
  await page.waitForSelector('.foglio');
  ok('il dettaglio si apre in un foglio', await page.isVisible('.foglio .lemma'));
  await page.screenshot({ path: path.join(SCATTI, '6-dettaglio.png') });
  await page.keyboard.press('Escape');
  await page.click('.velo', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);

  gruppo('Ripasso a produzione');
  // porto a scadenza tutte le parole passive
  await page.evaluate(() => {
    const p = Readda.Store.tutteLeParole();
    for (const k in p) if (p[k].prox) p[k].prox = Date.now() - 1000;
    Readda.Store.salva();
  });
  await page.click('.tab[data-rotta="#/ripasso"]');
  await page.waitForSelector('.prova');
  ok('la produzione viene prima del riconoscimento', await page.isVisible('#frase'));
  const lemmaProva = (await page.textContent('.prova .lemma')).trim();
  await page.screenshot({ path: path.join(SCATTI, '7-ripasso.png') });

  ok('Conferma è disabilitato a vuoto', await page.isDisabled('#conferma'));
  await page.fill('#frase', 'Una frase che non contiene la parola giusta.');
  await page.click('#conferma');
  await page.waitForSelector('.esito');
  ok('rifiuta la frase senza la parola', (await page.textContent('.esito')).includes('Manca la parola'));

  await page.fill('#frase', 'Oggi ho usato ' + lemmaProva + ' parlando con un collega.');
  await page.click('#conferma');
  await page.waitForTimeout(250);
  ok('accetta la frase corretta', (await page.textContent('.esito')).includes('Registrata') ||
                                  (await page.textContent('.esito')).includes('adesso'));
  await page.screenshot({ path: path.join(SCATTI, '8-frase-accettata.png') });
  await page.click('#conferma');
  await page.waitForTimeout(300);

  gruppo('Ripasso a riconoscimento');
  // salto eventuali altre produzioni
  for (let i = 0; i < 8 && await page.isVisible('#salta'); i++) {
    await page.click('#salta'); await page.waitForTimeout(200);
  }
  if (await page.isVisible('.opz')) {
    ok('il test a scelta multipla ha 4 opzioni', await page.locator('.opz').count() === 4);
    await page.click('.opz >> nth=0');
    await page.waitForSelector('.esito');
    ok('evidenzia sempre la risposta giusta', await page.locator('.opz.giusta').count() === 1);
    await page.screenshot({ path: path.join(SCATTI, '9-scelta-multipla.png') });
  } else {
    ok('il test a scelta multipla è raggiungibile', false, 'nessuna opzione trovata');
  }

  gruppo('Io');
  await page.click('.tab[data-rotta="#/io"]');
  await page.waitForSelector('.numeri');
  ok('mostra il nickname', (await page.textContent('.testata h1')).trim() === 'Riccardo');
  ok('mostra tre contatori', await page.locator('.numero').count() === 3);
  ok('il codice di ripristino è ancora lì', (await page.textContent('.io')).includes(codice));
  await page.screenshot({ path: path.join(SCATTI, '10-io.png'), fullPage: true });

  gruppo('Impostazioni dal vivo');
  await page.click('[data-dose="25"]');
  await page.waitForTimeout(350);
  ok('la dose cambia e resta selezionata',
     await page.getAttribute('.filtro[data-dose="25"]', 'aria-pressed') === 'true');
  const dosePersistita = await page.evaluate(() => Readda.Store.impostazioni().dose);
  ok('la dose e\' salvata nello stato', dosePersistita === 25, dosePersistita);
  await page.click('.tab[data-rotta="#/feed"]');
  await page.waitForSelector('#dose-txt');
  ok('il flusso usa la nuova dose', (await page.textContent('#dose-txt')).endsWith('/ 25'),
     await page.textContent('#dose-txt'));
  gruppo('Tastiera e lettori di schermo');
  {
    /* L'app si guida da tastiera (1, 2, 3 nel flusso) ma l'unico stile di
       fuoco stava sul campo di testo: chi non usa il puntatore non vedeva
       mai dove si trovava. */
    await page.click('.tab[data-rotta="#/feed"]');
    await page.waitForSelector('#carta-viva');
    const conFuoco = await page.evaluate(() => {
      const b = document.querySelector('[data-giudizio="attiva"]');
      b.focus();
      // :focus-visible non si attiva con .focus() da script in tutti i casi,
      // quindi si controlla che la regola esista e si applichi al selettore
      return [...document.styleSheets]
        .flatMap(f => { try { return [...f.cssRules]; } catch (e) { return []; } })
        .filter(r => r.selectorText && r.selectorText.indexOf(':focus-visible') >= 0)
        .map(r => r.selectorText);
    });
    ok('esistono regole di fuoco da tastiera', conFuoco.length >= 3, conFuoco.length);
    ok('coprono i bottoni principali',
       conFuoco.join(' ').indexOf('.azione:focus-visible') >= 0 &&
       conFuoco.join(' ').indexOf('.opz:focus-visible') >= 0, conFuoco);

    /* La pila si riscrive a ogni giudizio: senza regione viva il contenuto
       cambia in silenzio. E la carta dietro e' decorazione: letta ad alta
       voce annuncerebbe due parole quando ne e' arrivata una. */
    ok('la pila e\' una regione viva',
       await page.getAttribute('#pila', 'aria-live') === 'polite');
    ok('la carta dietro non viene annunciata',
       await page.evaluate(() => {
         const d = document.querySelector('.carta.dietro');
         return !d || d.getAttribute('aria-hidden') === 'true';
       }));
    ok('i timbri del trascinamento non vengono annunciati',
       await page.evaluate(() => [...document.querySelectorAll('.timbro')]
         .every(t => t.getAttribute('aria-hidden') === 'true')));
    ok('la sillabazione non viene letta lettera per lettera',
       await page.getAttribute('#carta-viva .sillabe', 'aria-hidden') === 'true');
    ok('la rarita\' ha un\'etichetta a parole',
       /rarit./.test(await page.getAttribute('#carta-viva .livello', 'aria-label') || ''),
       await page.getAttribute('#carta-viva .livello', 'aria-label'));
    ok('nessuna carta mostra un esempio vuoto',
       await page.evaluate(() => [...document.querySelectorAll('.carta .esempio')]
         .every(p => p.textContent.trim().length > 0)));
  }

  gruppo('Il foglio modale si chiude anche senza dito');
  {
    await page.click('.tab[data-rotta="#/collezione"]');
    await page.waitForSelector('.filtri');
    const voci = await page.locator('.voce').count();
    if (voci > 0) {
      // si apre con la tastiera, cosi' il fuoco di partenza e' la voce stessa
      await page.focus('.voce');
      const partenza = await page.evaluate(() =>
        document.activeElement.getAttribute('data-id'));
      await page.keyboard.press('Enter');
      await page.waitForSelector('.foglio');
      ok('il foglio si dichiara modale',
         await page.getAttribute('.foglio', 'aria-modal') === 'true');
      ok('il fuoco entra nel foglio',
         await page.evaluate(() => !!document.activeElement.closest('.foglio')));
      // il foglio della raccolta non ha campi: il fuoco sta sul contenitore,
      // non sul bottone «Toglila dalla raccolta»
      ok('il fuoco non finisce su un bottone che fa qualcosa',
         await page.evaluate(() => document.activeElement.tagName !== 'BUTTON'),
         await page.evaluate(() => document.activeElement.tagName));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(320);
      ok('Esc lo chiude', await page.locator('.foglio').count() === 0);
      const ritorno = await page.evaluate(() =>
        document.activeElement && document.activeElement.getAttribute
          ? document.activeElement.getAttribute('data-id') : null);
      ok('il fuoco torna esattamente sulla voce da cui era partito',
         ritorno !== null && ritorno === partenza, { partenza: partenza, ritorno: ritorno });
    } else {
      ok('nessuna voce in raccolta: foglio non verificabile', true, 'saltato');
    }
  }

  {
    /* Il foglio che chiede «Cancellare tutto?» comincia con «Si', cancella»:
       se il fuoco ci finisse sopra, un Invio distratto cancellerebbe
       l'account. */
    await page.click('.tab[data-rotta="#/io"]');
    await page.waitForSelector('#cancella');
    await page.click('#cancella');
    await page.waitForSelector('#si');
    ok('nel foglio di cancellazione il fuoco non sta sul bottone distruttivo',
       await page.evaluate(() => document.activeElement.id !== 'si'),
       await page.evaluate(() => document.activeElement.id || document.activeElement.className));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(320);
    ok('e l\'account esiste ancora',
       await page.evaluate(() => Readda.Store.caricato()) === true);
  }

  gruppo('La dose ferma il flusso, e lascia una porta');
  {
    /* La dose era un ornamento: la barra arrivava al 100% e il flusso
       continuava. Adesso si ferma. Ma un muro che manda via chi ha dieci
       minuti liberi sarebbe punitivo, quindi c'e' un'uscita esplicita. */
    await page.click('.tab[data-rotta="#/io"]');
    await page.waitForSelector('[data-dose]');
    await page.click('[data-dose="10"]');
    await page.waitForTimeout(250);
    await page.click('.tab[data-rotta="#/feed"]');
    await page.waitForSelector('#dose-txt');

    // si porta il conto delle parole nuove di oggi a ridosso della dose
    const nuovePrima = await page.evaluate(() => Readda.Store.nuoveOggi());
    ok('la dose conta le parole nuove, non i ripassi',
       (await page.textContent('#dose-txt')) === nuovePrima + ' / 10',
       { barra: await page.textContent('#dose-txt'), nuove: nuovePrima });

    let giri = 0;
    while (await page.locator('#carta-viva').count() && giri < 30) {
      await page.click('[data-giudizio="attiva"]');
      await page.waitForTimeout(340);
      giri++;
    }
    ok('il flusso si ferma alla dose', await page.locator('#oltre').count() === 1);

    /* I tasti restavano attivi sulla schermata di pausa: uno spazio
       giudicava una parola mai vista e, siccome preventDefault() partiva
       comunque, non azionava nemmeno il bottone su cui stava il fuoco. */
    const primaDeiTasti = await page.evaluate(() => Readda.Store.nuoveOggi());
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.waitForTimeout(400);
    ok('i tasti non giudicano parole mentre il flusso e\' fermo',
       await page.evaluate(() => Readda.Store.nuoveOggi()) === primaDeiTasti,
       { prima: primaDeiTasti, dopo: await page.evaluate(() => Readda.Store.nuoveOggi()) });
    ok('e la pausa e\' ancora li\'', await page.locator('#oltre').count() === 1);

    // lo spazio deve poter azionare il bottone, che e' il punto
    await page.focus('#oltre');
    await page.keyboard.press('Space');
    await page.waitForSelector('#carta-viva');
    ok('lo spazio sul bottone «Continua lo stesso» funziona',
       await page.locator('#carta-viva').count() === 1);
    ok('e i tre bottoni del flusso tornano visibili',
       await page.locator('[data-giudizio]').first().isVisible());
    // si rimette la pausa per le prove che seguono
    await page.click('.tab[data-rotta="#/collezione"]');
    await page.waitForSelector('.filtri');
    await page.click('.tab[data-rotta="#/feed"]');
    await page.waitForSelector('#carta-viva');
    ok('la barra non supera la dose', (await page.textContent('#dose-txt')) === '10 / 10',
       await page.textContent('#dose-txt'));

    ok('la scelta di continuare vale per tutta la giornata',
       await page.locator('#carta-viva').count() === 1);
    await page.click('[data-giudizio="attiva"]');
    await page.waitForTimeout(340);
    ok('e non si rimette in mezzo a ogni carta',
       await page.locator('#carta-viva').count() === 1);

    // si rimette la dose alta, cosi' le prove successive trovano il flusso aperto
    await page.click('.tab[data-rotta="#/io"]');
    await page.waitForSelector('[data-dose]');
    await page.click('[data-dose="40"]');
    await page.waitForTimeout(250);
  }

  await page.click('.tab[data-rotta="#/io"]');
  await page.waitForSelector('.numeri');

  ok('l\'interruttore del lessico esplicito parte spento',
     await page.getAttribute('#sw-esplicito', 'aria-checked') === 'false');
  await page.click('#sw-esplicito');
  await page.waitForTimeout(250);
  ok('si accende e resta acceso',
     await page.getAttribute('#sw-esplicito', 'aria-checked') === 'true' &&
     await page.evaluate(() => Readda.Store.impostazioni().esplicito) === true);
  await page.click('#sw-esplicito');
  await page.waitForTimeout(250);
  ok('si rispegne', await page.evaluate(() => Readda.Store.impostazioni().esplicito) === false);

  // percorso mai esercitato prima: accensione e spegnimento dei promemoria
  const spegnimento = await page.evaluate(() => {
    try {
      Readda.Store.imposta('notifiche', true);
      Readda.Notifiche.avvia();
      Readda.Notifiche.ferma();
      Readda.Store.imposta('notifiche', false);
      return 'ok';
    } catch (e) { return e.message; }
  });
  await page.click('[data-ora="9"]');
  await page.waitForTimeout(250);
  ok('l\'ora del promemoria si sceglie e resta',
     await page.getAttribute('.filtro[data-ora="9"]', 'aria-pressed') === 'true');
  ok('l\'ora del promemoria e\' salvata nello stato',
     await page.evaluate(() => Readda.Store.impostazioni().oraPromemoria) === 9);

  ok('avvia e ferma i promemoria senza errori', spegnimento === 'ok', spegnimento);

  await page.click('#esporta');
  await page.waitForSelector('#pacco');
  const backup = await page.inputValue('#pacco');
  ok('il backup è una stringa sostanziosa', backup.length > 200, backup.length);
  await page.click('.velo', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);

  gruppo('Persistenza e ripristino');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok('la sessione sopravvive al ricaricamento', !(await page.isVisible('#nick')));
  const nParole = await page.evaluate(() => Object.keys(Readda.Store.tutteLeParole()).length);
  ok('le parole sono ancora lì', nParole >= 4, nParole);

  await page.evaluate(() => { Readda.Store.esci(); location.hash = '#/entra'; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#nick');
  ok('dopo l\'uscita si torna all\'accesso', await page.isVisible('#nick'));
  ok('il nickname resta come scorciatoia', await page.isVisible('[data-rapido="Riccardo"]'));

  await page.click('#ripristina');
  await page.waitForSelector('#pacco');
  await page.fill('#pacco', backup);
  await page.click('#vai');
  await page.waitForTimeout(700);
  const nDopo = await page.evaluate(() => Object.keys(Readda.Store.tutteLeParole()).length);
  ok('il backup ripristina tutte le parole', nDopo === nParole, { nParole, nDopo });

  gruppo('Igiene');
  ok('nessun errore in console', errori.length === 0, errori.slice(0, 4));

  // nessuna schermata deve sforare in larghezza, su telefono stretto e su tablet
  for (const larg of [320, 390, 768]) {
    await page.setViewportSize({ width: larg, height: 844 });
    for (const r of ['#/feed', '#/ripasso', '#/collezione', '#/io']) {
      await page.evaluate(x => { location.hash = x; }, r);
      await page.waitForTimeout(260);
      const sfora = await page.evaluate(() => {
        const doc = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        // gli elementi dentro uno scorrevole orizzontale (i filtri) escono di proposito
        const dentroScorrevole = el => {
          for (let n = el.parentElement; n && n.id !== 'schermo'; n = n.parentElement) {
            if (getComputedStyle(n).overflowX === 'auto') return true;
          }
          return false;
        };
        const fuori = [...document.querySelectorAll('#schermo *')].filter(el => {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || dentroScorrevole(el)) return false;
          return b.right > innerWidth + 1 || b.left < -1;
        }).map(el => el.className || el.tagName);
        return { doc, fuori: fuori.slice(0, 3), quanti: fuori.length };
      });
      ok('a ' + larg + 'px nulla sfora in ' + r, !sfora.doc && sfora.quanti === 0, sfora);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await browser.close();
  console.log('\n' + (fallite === 0 ? 'TUTTO VERDE' : 'CI SONO ERRORI') +
    ' — ' + passate + ' passate, ' + fallite + ' fallite');
  console.log('Schermate in scatti/\n');
  process.exit(fallite ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
