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

  function invia(titolo, corpo) {
    if (permesso() !== 'granted') return;
    try {
      new Notification(titolo, {
        body: corpo,
        icon: 'assets/icona-192.png',
        badge: 'assets/icona-192.png',
        tag: 'readda-ripasso',
        renotify: false
      });
    } catch (e) { /* alcuni browser richiedono il service worker: si ignora */ }
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
    if (d.produzione > 0) {
      var s = Readda.Srs.scadenze(Readda.Store.tutteLeParole())
        .filter(function (x) { return x.tipo === 'produzione'; })[0];
      var l = Readda.Ui.lemmaPerId(s.id);
      return {
        titolo: 'L\'hai usata, «' + (l ? l.lemma : s.id) + '»?',
        corpo: 'Scrivi una frase vera in cui l\'hai detta o scritta. Se non e\' successo, va bene: riprova oggi.'
      };
    }
    return {
      titolo: Readda.Ui.plurale(d.totale, 'parola aspetta', 'parole aspettano'),
      corpo: 'Due minuti bastano per non perderle.'
    };
  }

  function controlla() {
    if (!Readda.Store.caricato()) return;
    if (!Readda.Store.impostazioni().notifiche) return;
    if (document.visibilityState === 'visible') return;  // se sei dentro, non ti disturbo
    var d = dovute();
    if (d.totale === 0) return;
    var m = messaggio(d);
    invia(m.titolo, m.corpo);
  }

  function avvia() {
    fermа();
    timer = setInterval(controlla, INTERVALLO);
  }
  function fermа() { if (timer) { clearInterval(timer); timer = null; } }

  function aggiornaPallino() {
    var el = document.querySelector('.pallino');
    if (!el) return;
    el.hidden = dovute().totale === 0;
  }

  return {
    supportate: supportate, permesso: permesso, chiedi: chiedi,
    dovute: dovute, avvia: avvia, ferma: fermа,
    aggiornaPallino: aggiornaPallino, invia: invia
  };
})();
