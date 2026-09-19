/* Readda — avvio e instradamento. */
window.Readda = window.Readda || {};

Readda.App = (function () {
  var ROTTE = {
    '#/entra':      { vista: function () { return Readda.Accesso; },   libera: true },
    '#/inizio':     { vista: function () { return Readda.Inizio; },    saltaControlloProfilo: true },
    '#/feed':       { vista: function () { return Readda.Feed; } },
    '#/ripasso':    { vista: function () { return Readda.Ripasso; } },
    '#/collezione': { vista: function () { return Readda.Collezione; } },
    '#/io':         { vista: function () { return Readda.Io; } }
  };

  var vistaCorrente = null;

  function vai(rotta) {
    if (location.hash === rotta) instrada();
    else location.hash = rotta;
  }

  function instrada() {
    var rotta = location.hash || '#/entra';
    var def = ROTTE[rotta];
    if (!def) { vai('#/entra'); return; }

    var dentro = Readda.Store.caricato();
    if (!def.libera && !dentro) { vai('#/entra'); return; }
    if (dentro && def.libera) { vai(Readda.Store.profilo().completo ? '#/feed' : '#/inizio'); return; }
    if (dentro && !def.saltaControlloProfilo && !Readda.Store.profilo().completo) { vai('#/inizio'); return; }

    if (vistaCorrente && vistaCorrente.smonta) vistaCorrente.smonta();
    vistaCorrente = def.vista();
    vistaCorrente.disegna();
    segnaTab(rotta);
    Readda.Notifiche.aggiornaPallino();
  }

  function segnaTab(rotta) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-rotta') === rotta) tabs[i].setAttribute('aria-current', 'page');
      else tabs[i].removeAttribute('aria-current');
    }
  }

  function avvia() {
    Readda.Ui.init();

    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) {
        vai(e.currentTarget.getAttribute('data-rotta'));
      });
    }

    window.addEventListener('hashchange', instrada);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') Readda.Notifiche.aggiornaPallino();
    });

    if (Readda.Store.riprendiSessione()) {
      if (Readda.Store.impostazioni().notifiche) Readda.Notifiche.avvia();
      if (!location.hash || location.hash === '#/entra') {
        location.replace('#' + (Readda.Store.profilo().completo ? '/feed' : '/inizio'));
      }
    } else if (!location.hash) {
      location.replace('#/entra');
    }

    instrada();
    salutaSeCiSonoScadenze();

    // READDA_SENZA_SW lo mette strumenti/artefatto.py: dentro un artefatto
    // la pagina non sta alla radice di un dominio suo e sw.js non viene
    // pubblicato, quindi la registrazione fallirebbe a ogni apertura
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 &&
        !window.READDA_SENZA_SW) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline non disponibile */ });
    }
  }

  function salutaSeCiSonoScadenze() {
    if (!Readda.Store.caricato()) return;
    var d = Readda.Notifiche.dovute();
    if (!d.totale) return;
    setTimeout(function () {
      Readda.Ui.brindisi(
        d.produzione > 0
          ? Readda.Ui.plurale(d.produzione, 'parola aspetta', 'parole aspettano') + ' una tua frase'
          : Readda.Ui.plurale(d.totale, 'parola da ripassare', 'parole da ripassare')
      );
    }, 900);
  }

  return { avvia: avvia, vai: vai, instrada: instrada };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Readda.App.avvia);
} else {
  Readda.App.avvia();
}
