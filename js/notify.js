/* Readda — promemoria.
 * Limite dichiarato: senza un server con Web Push, il browser puo' consegnare
 * notifiche solo mentre la scheda e' aperta o in background recente. Qui si fa
 * il massimo possibile lato client: permesso, controllo delle scadenze a
 * intervalli, e recupero all'apertura dell'app. Vedi README per il passo server.
 */
window.Readda = window.Readda || {};

Readda.Notifiche = (function () {
  var timer = null;
  var INTERVALLO = 5 * 60 * 1000;
  var conServer = null;      // null = non ancora saputo
  var chiaveVapid = null;

  function supportate() { return typeof Notification !== 'undefined'; }
  function permesso() { return supportate() ? Notification.permission : 'unsupported'; }

  function chiedi() {
    if (!supportate()) return Promise.resolve('unsupported');
    return Notification.requestPermission();
  }

  /* Restituisce true solo se la notifica e' partita davvero. Serve a
   * controlla(): segnare il promemoria del giorno quando non e' uscito
   * niente costa a chi legge il promemoria di quel giorno, e per sempre
   * sui browser dove la notifica non parte mai. */
  function invia(titolo, corpo) {
    if (permesso() !== 'granted') return false;
    try {
      new Notification(titolo, {
        body: corpo,
        icon: 'assets/icona-192.png',
        badge: 'assets/icona-192.png',
        tag: 'readda-ripasso',
        renotify: false
      });
      return true;
    } catch (e) {
      // alcuni browser richiedono il service worker: non e' partita
      return false;
    }
  }

  /* Quante voci sono scadute adesso, divise per tipo. */
  function dovute() {
    if (!Readda.Store.caricato()) return { totale: 0, produzione: 0, riconoscimento: 0 };
    var s = Readda.Srs.scadenze(Readda.Store.tutteLeParole());
    return {
      totale: s.length,
      produzione: s.filter(function (x) { return x.tipo === 'produzione'; }).length,
      riconoscimento: s.filter(function (x) { return x.tipo === 'riconoscimento'; }).length,
      elenco: s
    };
  }

  function messaggio(d) {
    // `dovute()` ha gia' l'elenco: ricalcolarlo qui lo faceva divergere, e
    // bastava che nel frattempo cambiasse per leggere `undefined.id`
    var prima = (d.elenco || []).filter(function (x) { return x.tipo === 'produzione'; })[0];
    if (d.produzione > 0 && prima) {
      var l = Readda.Ui.lemmaPerId(prima.id);
      return {
        titolo: 'L\'hai usata, «' + (l ? l.lemma : prima.id) + '»?',
        corpo: 'Scrivi una frase vera in cui l\'hai detta o scritta. Se non e\' successo, va bene: riprova oggi.'
      };
    }
    return {
      titolo: Readda.Ui.plurale(d.totale, 'parola aspetta', 'parole aspettano'),
      corpo: 'Due minuti bastano per non perderle.'
    };
  }

  /* L'ora scelta in Io era salvata e non la leggeva nessuno: con la scheda
   * in secondo piano il controllo partiva ogni cinque minuti dalla mattina
   * alla notte. Adesso la finestra e' di due ore intorno all'ora scelta, e
   * il promemoria e' uno al giorno: due volte lo stesso giorno non e' un
   * promemoria, e' un assillo. */
  var FINESTRA_ORE = 2;

  function nellaFinestra(ora, adesso) {
    var scarto = adesso - ora;
    if (scarto < 0) scarto += 24;              // dopo mezzanotte per un'ora serale
    return scarto < FINESTRA_ORE;
  }

  /* ==================================================== con un server
   * Il Web Push ha bisogno di qualcuno che tenga le scadenze e scriva al
   * servizio push del browser: non si programma dal solo lato client.
   * Quando c'e' un server dietro, il controllo locale qui sotto si spegne.
   */
  function pushPossibile() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) &&
           (location.protocol === 'https:' || location.hostname === 'localhost');
  }

  function api(via, metodo, corpo) {
    return fetch(via, {
      method: metodo || 'GET',
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { stato: r.status, dati: d }; });
    });
  }

  /* C'e' un server dietro? Si scopre chiedendogli la chiave, una volta sola. */
  function cercaServer() {
    if (conServer !== null) return Promise.resolve(conServer);
    return api('/api/chiave').then(function (r) {
      conServer = r.stato === 200 && !!r.dati.chiave;
      chiaveVapid = conServer ? r.dati.chiave : null;
      return conServer;
    }).catch(function () { conServer = false; return false; });
  }

  function bytesDaB64u(s) {
    var pad = '='.repeat((4 - s.length % 4) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function b64uDaBuffer(buf) {
    var b = '', v = new Uint8Array(buf);
    for (var i = 0; i < v.length; i++) b += String.fromCharCode(v[i]);
    return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* Tutte le parole che torneranno, non solo quelle gia' mature: il server
   * non sa nulla del corpus, quindi il lemma da chiedere viaggia con loro. */
  function scadenzeDaMandare() {
    var parole = Readda.Store.tutteLeParole(), fuori = [];
    for (var id in parole) {
      if (!parole.hasOwnProperty(id)) continue;
      var w = parole[id];
      if (!w.prox) continue;
      var tipo = (w.stato === 'passiva' || w.bluff) ? 'produzione'
               : (w.stato === 'ignota' ? 'riconoscimento' : null);
      if (!tipo) continue;
      fuori.push({ quando: w.prox, lemma: id, tipo: tipo });
    }
    fuori.sort(function (a, b) { return a.quando - b.quando; });
    return fuori.slice(0, 500);
  }

  function fusoOrario() { return -new Date().getTimezoneOffset(); }

  function iscrivi() {
    return cercaServer().then(function (c) {
      if (!c) return { ok: false, motivo: 'nessun server' };
      if (!pushPossibile()) return { ok: false, motivo: 'i push non sono disponibili qui' };
      return navigator.serviceWorker.register('sw.js')
        .then(function (reg) { return navigator.serviceWorker.ready.then(function () { return reg; }); })
        .then(function (reg) {
          return reg.pushManager.getSubscription().then(function (gia) {
            return gia || reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: bytesDaB64u(chiaveVapid)
            });
          });
        })
        .then(function (sub) {
          var j = sub.toJSON ? sub.toJSON() : {};
          var iscr = {
            endpoint: sub.endpoint,
            keys: (j && j.keys) || {
              p256dh: b64uDaBuffer(sub.getKey('p256dh')),
              auth: b64uDaBuffer(sub.getKey('auth'))
            }
          };
          return api('/api/iscrizione', 'POST', {
            nick: Readda.Store.profilo().nick,
            iscrizione: iscr,
            gettone: Readda.Store.impostazioni().gettone || undefined,
            fuso: fusoOrario(),
            ora: Readda.Store.impostazioni().oraPromemoria,
            scadenze: scadenzeDaMandare()
          }).then(function (r) {
            if (r.stato !== 200) return { ok: false, motivo: (r.dati && r.dati.errore) || 'rifiutata' };
            Readda.Store.imposta('gettone', r.dati.gettone);
            Readda.Store.imposta('notifiche', true);
            return { ok: true, server: true };
          });
        })
        .catch(function (e) { return { ok: false, motivo: (e && e.message) || 'iscrizione fallita' }; });
    });
  }

  function disiscrivi() {
    var imp = Readda.Store.impostazioni();
    Readda.Store.imposta('notifiche', false);
    ferma();
    if (!conServer || !imp.gettone) return Promise.resolve();
    return api('/api/iscrizione', 'DELETE', {
      nick: Readda.Store.profilo().nick, gettone: imp.gettone
    }).catch(function () {});
  }

  /* Da richiamare quando le scadenze cambiano: il server deve sapere quando
   * tornare a chiedere, altrimenti sveglia per parole gia' fatte. */
  var sincronizzando = false;
  function sincronizza() {
    if (!Readda.Store.caricato()) return Promise.resolve(false);
    var imp = Readda.Store.impostazioni();
    if (!imp.notifiche || !imp.gettone || sincronizzando) return Promise.resolve(false);
    return cercaServer().then(function (c) {
      if (!c) return false;
      sincronizzando = true;
      return api('/api/scadenze', 'POST', {
        nick: Readda.Store.profilo().nick,
        gettone: imp.gettone,
        fuso: fusoOrario(),
        ora: imp.oraPromemoria,
        scadenze: scadenzeDaMandare()
      }).then(function (r) {
        sincronizzando = false;
        // gettone non piu' valido: l'iscrizione va rifatta
        if (r.stato === 403 || r.stato === 404) Readda.Store.imposta('gettone', null);
        return r.stato === 200;
      }).catch(function () { sincronizzando = false; return false; });
    });
  }

  function modo() { return conServer === null ? 'ignoto' : (conServer ? 'server' : 'locale'); }

  /* ================================================= senza server */
  function controlla() {
    if (conServer) return;          // ci pensa il server, anche ad app chiusa
    if (!Readda.Store.caricato()) return;
    var imp = Readda.Store.impostazioni();
    if (!imp.notifiche) return;
    if (document.visibilityState === 'visible') return;  // se sei dentro, non ti disturbo
    if (!nellaFinestra(imp.oraPromemoria, new Date().getHours())) return;
    if (Readda.Store.avvisatoOggi()) return;
    var d = dovute();
    if (d.totale === 0) return;
    var m = messaggio(d);
    if (invia(m.titolo, m.corpo)) Readda.Store.segnaAvviso();
  }

  function avvia() {
    ferma();
    cercaServer().then(function (c) {
      if (c) { sincronizza(); return; }
      timer = setInterval(controlla, INTERVALLO);
    });
  }
  function ferma() { if (timer) { clearInterval(timer); timer = null; } }

  function aggiornaPallino() {
    var el = document.querySelector('.pallino');
    if (!el) return;
    el.hidden = dovute().totale === 0;
  }

  return {
    supportate: supportate, permesso: permesso, chiedi: chiedi,
    dovute: dovute, avvia: avvia, ferma: ferma,
    aggiornaPallino: aggiornaPallino, invia: invia,
    messaggio: messaggio, nellaFinestra: nellaFinestra, controlla: controlla,
    cercaServer: cercaServer, pushPossibile: pushPossibile, modo: modo,
    iscrivi: iscrivi, disiscrivi: disiscrivi, sincronizza: sincronizza,
    scadenzeDaMandare: scadenzeDaMandare
  };
})();
