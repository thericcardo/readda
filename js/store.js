/* Readda — stato e persistenza.
 * Nessun server: tutto vive in localStorage, indicizzato per nickname,
 * così più persone possono usare lo stesso dispositivo.
 * Il codice di ripristino serve a riconoscere l'account e a firmare
 * l'esportazione dei dati (vedi Store.esporta / Store.importa).
 */
window.Readda = window.Readda || {};

Readda.Store = (function () {
  var CHIAVE_UTENTI = 'readda.utenti.v1';
  var CHIAVE_ATTIVO = 'readda.attivo.v1';

  var stato = null;   // account attualmente caricato
  var nick = null;

  /* ---------- lettura/scrittura grezza ---------- */
  function leggiTutti() {
    try { return JSON.parse(localStorage.getItem(CHIAVE_UTENTI)) || {}; }
    catch (e) { return {}; }
  }
  function scriviTutti(o) {
    try { localStorage.setItem(CHIAVE_UTENTI, JSON.stringify(o)); return true; }
    catch (e) { return false; }
  }

  function vuoto(n, codice) {
    return {
      profilo: { nick: n, codice: codice, lavoro: null, interessi: [], obiettivo: null, creato: Date.now(), completo: false },
      parole: {},
      stats: { striscia: 0, ultimoGiorno: null, giorni: [], scorse: 0 },
      impostazioni: { notifiche: false, dose: 15, oraPromemoria: 20, esplicito: false }
    };
  }

  /* ---------- codice di ripristino ---------- */
  var SILLABE = ['bra','cor','del','fio','gua','lan','mer','nis','ora','pel','rin','sal','tor','vel','zaf','cam','dun','fal'];
  function generaCodice() {
    var p = [];
    for (var i = 0; i < 4; i++) {
      var s = SILLABE[Math.floor(Math.random() * SILLABE.length)] +
              SILLABE[Math.floor(Math.random() * SILLABE.length)];
      p.push(s);
    }
    return p.join('-');
  }

  /* ---------- account ---------- */
  function registra(n, codicePreesistente) {
    n = (n || '').trim();
    if (!n) return { ok: false, err: 'Scegli un nickname.' };
    if (n.length < 2) return { ok: false, err: 'Almeno 2 caratteri.' };
    if (n.length > 24) return { ok: false, err: 'Massimo 24 caratteri.' };
    var tutti = leggiTutti();
    var chiave = n.toLowerCase();
    if (tutti[chiave]) return { ok: false, err: 'Questo nickname esiste già su questo dispositivo.' };
    var codice = codicePreesistente || generaCodice();
    tutti[chiave] = vuoto(n, codice);
    if (!scriviTutti(tutti)) return { ok: false, err: 'Memoria del browser non disponibile.' };
    return { ok: true, codice: codice, nick: n };
  }

  function entra(n) {
    n = (n || '').trim();
    var tutti = leggiTutti();
    var chiave = n.toLowerCase();
    if (!tutti[chiave]) return { ok: false, err: 'Nickname non trovato su questo dispositivo.' };
    stato = tutti[chiave];
    nick = chiave;
    localStorage.setItem(CHIAVE_ATTIVO, chiave);
    return { ok: true };
  }

  function riprendiSessione() {
    var chiave = localStorage.getItem(CHIAVE_ATTIVO);
    if (!chiave) return false;
    var tutti = leggiTutti();
    if (!tutti[chiave]) return false;
    stato = tutti[chiave]; nick = chiave;
    return true;
  }

  function esci() {
    stato = null; nick = null;
    localStorage.removeItem(CHIAVE_ATTIVO);
  }

  function elencoNick() {
    var t = leggiTutti(), out = [];
    for (var k in t) if (t.hasOwnProperty(k)) out.push(t[k].profilo.nick);
    return out;
  }

  function salva() {
    if (!nick) return;
    var tutti = leggiTutti();
    tutti[nick] = stato;
    scriviTutti(tutti);
  }

  /* ---------- profilo ---------- */
  function profilo() { return stato ? stato.profilo : null; }
  function aggiornaProfilo(campi) {
    if (!stato) return;
    for (var k in campi) if (campi.hasOwnProperty(k)) stato.profilo[k] = campi[k];
    salva();
  }

  /* ---------- parole ---------- */
  function parola(id) { return stato.parole[id] || null; }

  function segna(id, nuovoStato) {
    if (!stato) return null;
    var ora = Date.now();
    var p = stato.parole[id];
    if (!p) {
      p = { stato: nuovoStato, box: 0, prox: 0, visto: 0, usi: [], ok: 0, ko: 0, dal: ora, bluff: false };
      stato.parole[id] = p;
    }
    p.stato = nuovoStato;
    p.visto += 1;
    p.ultimo = ora;

    if (nuovoStato === 'ignota') {
      p.box = 0;
      p.prox = ora + Readda.Srs.intervallo(0);
    } else if (nuovoStato === 'passiva') {
      // il cuore del prodotto: parte già in box 1, si chiude solo con una frase scritta
      p.box = Math.max(p.box, 1);
      p.prox = ora + Readda.Srs.intervallo(1);
    } else { // attiva
      // ogni tanto l'app bluffa: chiede di dimostrarlo fra due giorni
      if (!p.bluff && Math.random() < 0.18) {
        p.bluff = true;
        p.prox = ora + 2 * 864e5;
      } else {
        p.prox = 0;
      }
    }
    registraGiorno();
    salva();
    return p;
  }

  function registraUso(id, frase) {
    var p = stato.parole[id];
    if (!p) return;
    p.usi.push({ testo: frase, quando: Date.now() });
    p.ok += 1;
    p.bluff = false;
    // tre usi scritti = la parola è passata da passiva ad attiva davvero
    if (p.usi.length >= 3) { p.stato = 'attiva'; p.prox = 0; }
    else { p.box = Math.min(p.box + 1, 5); p.prox = Date.now() + Readda.Srs.intervallo(p.box); }
    registraGiorno();
    salva();
  }

  function registraProva(id, esatto) {
    var p = stato.parole[id];
    if (!p) return;
    if (esatto) {
      p.ok += 1;
      p.box = Math.min(p.box + 1, 5);
      if (p.box >= 4 && p.stato === 'ignota') p.stato = 'passiva'; // riconosciuta: ora va usata
    } else {
      p.ko += 1;
      p.box = Math.max(p.box - 1, 0);
      p.stato = 'ignota';
    }
    p.prox = Date.now() + Readda.Srs.intervallo(p.box);
    p.bluff = false;
    registraGiorno();
    salva();
  }

  function dimentica(id) { delete stato.parole[id]; salva(); }

  function perStato(s) {
    var out = [];
    for (var id in stato.parole) {
      if (stato.parole.hasOwnProperty(id) && stato.parole[id].stato === s) out.push(id);
    }
    return out;
  }

  function contaVisti() { return Object.keys(stato.parole).length; }

  /* ---------- striscia di giorni ---------- */
  function oggiISO() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function registraGiorno() {
    var g = oggiISO();
    var s = stato.stats;
    if (s.ultimoGiorno === g) return;
    var ieri = new Date(Date.now() - 864e5);
    var ieriISO = ieri.getFullYear() + '-' + (ieri.getMonth() + 1) + '-' + ieri.getDate();
    s.striscia = (s.ultimoGiorno === ieriISO) ? s.striscia + 1 : 1;
    s.ultimoGiorno = g;
    s.giorni.push(g);
    if (s.giorni.length > 400) s.giorni = s.giorni.slice(-400);
  }

  function strisciaViva() {
    var s = stato.stats;
    if (!s.ultimoGiorno) return 0;
    var g = oggiISO();
    var ieri = new Date(Date.now() - 864e5);
    var ieriISO = ieri.getFullYear() + '-' + (ieri.getMonth() + 1) + '-' + ieri.getDate();
    return (s.ultimoGiorno === g || s.ultimoGiorno === ieriISO) ? s.striscia : 0;
  }

  function fatteOggi() {
    var g = oggiISO(), n = 0, inizio = new Date(); inizio.setHours(0, 0, 0, 0);
    for (var id in stato.parole) {
      if (stato.parole.hasOwnProperty(id) && stato.parole[id].ultimo >= inizio.getTime()) n++;
    }
    return n;
  }

  /* ---------- impostazioni ---------- */
  function impostazioni() {
    // gli account creati prima che l'impostazione esistesse non ce l'hanno
    if (stato.impostazioni.esplicito === undefined) stato.impostazioni.esplicito = false;
    return stato.impostazioni;
  }
  function imposta(k, v) { stato.impostazioni[k] = v; salva(); }

  /* ---------- esportazione / importazione ---------- */
  function esporta() {
    var pacco = { v: 1, nick: stato.profilo.nick, dati: stato };
    return btoa(unescape(encodeURIComponent(JSON.stringify(pacco))));
  }

  function importa(stringa) {
    var pacco;
    try { pacco = JSON.parse(decodeURIComponent(escape(atob(stringa.trim())))); }
    catch (e) { return { ok: false, err: 'Codice non leggibile.' }; }
    if (!pacco || !pacco.dati || !pacco.dati.profilo) return { ok: false, err: 'Codice non valido.' };
    var tutti = leggiTutti();
    var chiave = pacco.dati.profilo.nick.toLowerCase();
    tutti[chiave] = pacco.dati;
    scriviTutti(tutti);
    stato = pacco.dati; nick = chiave;
    localStorage.setItem(CHIAVE_ATTIVO, chiave);
    return { ok: true, nick: pacco.dati.profilo.nick };
  }

  function cancellaAccount() {
    var tutti = leggiTutti();
    delete tutti[nick];
    scriviTutti(tutti);
    esci();
  }

  return {
    registra: registra, entra: entra, esci: esci, riprendiSessione: riprendiSessione,
    elencoNick: elencoNick, generaCodice: generaCodice,
    profilo: profilo, aggiornaProfilo: aggiornaProfilo,
    parola: parola, segna: segna, registraUso: registraUso, registraProva: registraProva,
    dimentica: dimentica, perStato: perStato, contaVisti: contaVisti,
    tutteLeParole: function () { return stato.parole; },
    strisciaViva: strisciaViva, fatteOggi: fatteOggi,
    impostazioni: impostazioni, imposta: imposta,
    esporta: esporta, importa: importa, cancellaAccount: cancellaAccount,
    salva: salva,
    caricato: function () { return !!stato; }
  };
})();
