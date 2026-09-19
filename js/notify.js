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

  function controlla() {
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
    timer = setInterval(controlla, INTERVALLO);
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
    messaggio: messaggio, nellaFinestra: nellaFinestra, controlla: controlla
  };
})();
