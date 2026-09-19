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

  /* ---------- forma dei dati ----------
   * Un account puo' arrivare da una versione precedente dell'app o da un
   * backup scritto a mano, e in quel caso gli manca qualcosa. Finora ogni
   * vista se la cavava per conto suo: la raccolta metteva le sue difese
   * (`p.usi = p.usi || []`), il ripasso e la schermata Io no, e leggevano
   * `p.usi.length` su un campo che poteva non esserci. Tre difese diverse
   * per lo stesso problema vuol dire due punti scoperti.
   *
   * Qui c'e' un posto solo: si passa di qui una volta, quando l'account si
   * carica, e da li' in poi la forma e' garantita. */
  function normalizzaParola(p) {
    if (!p || typeof p !== 'object') return null;
    if (!Array.isArray(p.usi)) p.usi = [];
    if (typeof p.box !== 'number') p.box = 0;
    if (typeof p.prox !== 'number') p.prox = 0;
    if (typeof p.visto !== 'number') p.visto = 0;
    if (typeof p.ok !== 'number') p.ok = 0;
    if (typeof p.ko !== 'number') p.ko = 0;
    if (typeof p.ultimo !== 'number') p.ultimo = p.dal || 0;
    p.bluff = !!p.bluff;
    // senza uno stato la parola non appartiene a nessun elenco: e' rumore
    if (['ignota', 'passiva', 'attiva'].indexOf(p.stato) < 0) return null;
    return p;
  }

  function normalizzaStato(s) {
    if (!s || typeof s !== 'object' || !s.profilo || typeof s.profilo.nick !== 'string') return null;
    var base = vuoto(s.profilo.nick, s.profilo.codice || generaCodice());
    var k;
    for (k in base.profilo) {
      if (base.profilo.hasOwnProperty(k) && s.profilo[k] === undefined) s.profilo[k] = base.profilo[k];
    }
    if (!Array.isArray(s.profilo.interessi)) s.profilo.interessi = [];

    if (!s.parole || typeof s.parole !== 'object') s.parole = {};
    for (var id in s.parole) {
      if (!s.parole.hasOwnProperty(id)) continue;
      if (!normalizzaParola(s.parole[id])) delete s.parole[id];
    }

    if (!s.stats || typeof s.stats !== 'object') s.stats = base.stats;
    if (!Array.isArray(s.stats.giorni)) s.stats.giorni = [];
    if (typeof s.stats.striscia !== 'number') s.stats.striscia = 0;

    if (!s.impostazioni || typeof s.impostazioni !== 'object') s.impostazioni = base.impostazioni;
    for (k in base.impostazioni) {
      if (base.impostazioni.hasOwnProperty(k) && s.impostazioni[k] === undefined) {
        s.impostazioni[k] = base.impostazioni[k];
      }
    }
    return s;
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

  // in una finestra privata, o con i dati del sito bloccati, questi accessi
  // lanciano: l'app deve continuare a funzionare, solo senza ricordare
  function ricorda(chiave) { try { localStorage.setItem(CHIAVE_ATTIVO, chiave); } catch (e) {} }
  function ricordato() { try { return localStorage.getItem(CHIAVE_ATTIVO); } catch (e) { return null; } }
  function scorda() { try { localStorage.removeItem(CHIAVE_ATTIVO); } catch (e) {} }

  function entra(n) {
    n = (n || '').trim();
    var tutti = leggiTutti();
    var chiave = n.toLowerCase();
    if (!tutti[chiave]) return { ok: false, err: 'Nickname non trovato su questo dispositivo.' };
    var s = normalizzaStato(tutti[chiave]);
    if (!s) return { ok: false, err: 'I dati di questo account sono illeggibili.' };
    stato = s;
    nick = chiave;
    ricorda(chiave);
    return { ok: true };
  }

  function riprendiSessione() {
    var chiave = ricordato();
    if (!chiave) return false;
    var tutti = leggiTutti();
    if (!tutti[chiave]) return false;
    var s = normalizzaStato(tutti[chiave]);
    if (!s) return false;
    stato = s; nick = chiave;
    return true;
  }

  function esci() {
    stato = null; nick = null;
    scorda();
  }

  function elencoNick() {
    var t = leggiTutti(), out = [];
    for (var k in t) {
      // un account rotto non deve impedire l'elenco degli altri
      if (t.hasOwnProperty(k) && t[k] && t[k].profilo && t[k].profilo.nick) out.push(t[k].profilo.nick);
    }
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

  /* ---------- striscia di giorni ----------
   *
   * "Ieri" non si calcola togliendo ventiquattro ore all'istante di adesso.
   * Il giorno del passaggio all'ora legale ne dura ventitre', quindi il
   * lunedi' successivo alle 00:30 quel conto torna indietro di due giorni:
   *   31 marzo 2025, 00:30  meno 864e5 ms  =  29 marzo, 23:30
   * La striscia non riconosceva il giorno prima e ripartiva da uno. Due
   * volte l'anno, a chi apre l'app dopo mezzanotte - e la striscia e' uno
   * dei tre numeri della schermata Io.
   *
   * Si passa quindi per il calendario: si prende la data di oggi e le si
   * toglie un giorno, che e' un'operazione definita qualunque cosa faccia
   * l'orologio. */
  function giornoDi(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function oggiISO() { return giornoDi(new Date()); }

  function ieriISO() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);   // mezzogiorno: nessun cambio d'ora lo sposta di giorno
    d.setDate(d.getDate() - 1);
    return giornoDi(d);
  }

  function registraGiorno() {
    var g = oggiISO();
    var s = stato.stats;
    if (s.ultimoGiorno === g) return;
    s.striscia = (s.ultimoGiorno === ieriISO()) ? s.striscia + 1 : 1;
    s.ultimoGiorno = g;
    s.giorni.push(g);
    if (s.giorni.length > 400) s.giorni = s.giorni.slice(-400);
  }

  function strisciaViva() {
    var s = stato.stats;
    if (!s.ultimoGiorno) return 0;
    return (s.ultimoGiorno === oggiISO() || s.ultimoGiorno === ieriISO()) ? s.striscia : 0;
  }

  function fatteOggi() {
    var n = 0, inizio = new Date(); inizio.setHours(0, 0, 0, 0);
    for (var id in stato.parole) {
      if (stato.parole.hasOwnProperty(id) && stato.parole[id].ultimo >= inizio.getTime()) n++;
    }
    return n;
  }

  /* ---------- impostazioni ---------- */
  // i campi mancanti li riempie normalizzaStato() al caricamento dell'account
  function impostazioni() { return stato.impostazioni; }
  function imposta(k, v) { stato.impostazioni[k] = v; salva(); }

  /* ---------- esportazione / importazione ---------- */
  function esporta() {
    var pacco = { v: 1, nick: stato.profilo.nick, dati: stato };
    return btoa(unescape(encodeURIComponent(JSON.stringify(pacco))));
  }

  /* Il backup e' l'unica rete di sicurezza di un'app senza server: se il
   * ripristino puo' rompere l'app, la rete non c'e'. Prima bastava un pacco
   * con `profilo` ma senza `nick` per far saltare tutto con un TypeError e
   * lasciare la schermata bianca, invece di dire "codice non valido". */
  function importa(stringa) {
    var pacco;
    try { pacco = JSON.parse(decodeURIComponent(escape(atob(String(stringa || '').trim())))); }
    catch (e) { return { ok: false, err: 'Codice non leggibile.' }; }
    if (!pacco || typeof pacco !== 'object' || !pacco.dati) {
      return { ok: false, err: 'Codice non valido.' };
    }
    var s = normalizzaStato(pacco.dati);
    if (!s) return { ok: false, err: 'Il backup non contiene un account leggibile.' };
    var nome = s.profilo.nick.trim();
    if (nome.length < 2 || nome.length > 24) {
      return { ok: false, err: 'Il backup ha un nickname non valido.' };
    }
    var tutti = leggiTutti();
    var chiave = nome.toLowerCase();
    tutti[chiave] = s;
    if (!scriviTutti(tutti)) return { ok: false, err: 'Memoria del browser non disponibile.' };
    stato = s; nick = chiave;
    ricorda(chiave);
    return { ok: true, nick: nome };
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
    oggiISO: oggiISO, ieriISO: ieriISO,
    impostazioni: impostazioni, imposta: imposta,
    esporta: esporta, importa: importa, cancellaAccount: cancellaAccount,
    salva: salva,
    caricato: function () { return !!stato; }
  };
})();
