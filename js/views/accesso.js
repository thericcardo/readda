/* Readda — accesso: solo nickname, piu' un codice di ripristino per non
 * perdere tutto cambiando dispositivo. Nessuna email, nessuna password. */
window.Readda = window.Readda || {};

Readda.Accesso = (function () {
  var U = null, S = null;

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    var esistenti = S.elencoNick();
    var scorciatoie = esistenti.length
      ? '<div class="switcher">Già su questo dispositivo: ' +
        esistenti.map(function (n) {
          return '<button data-rapido="' + U.esc(n) + '">' + U.esc(n) + '</button>';
        }).join(' · ') + '</div>'
      : '';

    U.rendi(
      '<div class="accesso">' +
        '<div class="marchio">' +
          '<div class="r">Readda</div>' +
          '<p class="claim">Le parole che conosci<br>ma non usi mai.</p>' +
        '</div>' +
        '<form id="modulo" novalidate>' +
          '<input class="campo" id="nick" name="nick" placeholder="Scegli un nickname" ' +
                 'autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="24">' +
          '<button class="btn btn-oro btn-pieno" type="submit">Comincia</button>' +
          '<p class="nota" id="nota">Niente email, niente password.<br>' +
            'Ti diamo un <b>codice di ripristino</b>: è l’unico modo per riprenderti i tuoi dati.</p>' +
        '</form>' +
        scorciatoie +
        '<div class="switcher"><button id="ripristina">Ho già un codice di ripristino</button></div>' +
      '</div>',
      { senzaBarra: true }
    );

    U.uno('#modulo').addEventListener('submit', invia);
    U.su('[data-rapido]', 'click', function (e) {
      var n = e.currentTarget.getAttribute('data-rapido');
      if (S.entra(n).ok) Readda.App.vai(S.profilo().completo ? '#/feed' : '#/inizio');
    });
    U.uno('#ripristina').addEventListener('click', apriRipristino);
    setTimeout(function () { var c = U.uno('#nick'); if (c) c.focus(); }, 320);
  }

  function invia(e) {
    e.preventDefault();
    var nome = U.uno('#nick').value.trim();
    var nota = U.uno('#nota');

    // se esiste gia' su questo dispositivo, e' un rientro, non una registrazione
    var rientro = S.entra(nome);
    if (rientro.ok) {
      Readda.App.vai(S.profilo().completo ? '#/feed' : '#/inizio');
      return;
    }

    var r = S.registra(nome);
    if (!r.ok) { nota.innerHTML = '<b style="color:#E8927C">' + U.esc(r.err) + '</b>'; return; }
    S.entra(nome);
    mostraCodice(r.codice);
  }

  function mostraCodice(codice) {
    U.rendi(
      '<div class="accesso">' +
        '<div class="marchio" style="padding-top:12vh">' +
          '<div class="r" style="font-size:40px">Ecco fatto.</div>' +
          '<p class="claim">Segna questo codice prima di andare avanti.</p>' +
        '</div>' +
        '<div style="margin-top:auto">' +
          '<div class="codice-box">' +
            '<span class="occhiello">Codice di ripristino</span>' +
            '<div class="codice-val" id="cod">' + U.esc(codice) + '</div>' +
            '<p>Senza questo codice, se cambi telefono o svuoti il browser, ' +
               'i tuoi progressi non tornano indietro. Non lo conosce nessun server: esiste solo qui.</p>' +
          '</div>' +
          '<button class="btn btn-filo btn-pieno" id="copia" style="margin-top:12px">Copia il codice</button>' +
          '<button class="btn btn-oro btn-pieno" id="avanti" style="margin-top:10px">L’ho segnato, andiamo</button>' +
        '</div>' +
      '</div>',
      { senzaBarra: true }
    );

    U.uno('#copia').addEventListener('click', function () {
      var t = U.uno('#cod').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
          function () { U.brindisi('Codice copiato'); },
          function () { U.brindisi('Copialo a mano: ' + t); }
        );
      } else { U.brindisi('Copialo a mano: ' + t); }
    });
    U.uno('#avanti').addEventListener('click', function () { Readda.App.vai('#/inizio'); });
  }

  function apriRipristino() {
    U.foglio(
      '<h2 style="font-family:var(--serif);font-weight:400;font-size:24px;margin:0 0 6px;letter-spacing:-.02em">Ripristina i tuoi dati</h2>' +
      '<p style="color:var(--inchiostro-3);font-size:13.5px;margin:0 0 18px;line-height:1.55">' +
        'Incolla qui la stringa di backup che avevi esportato da <b>Io → Esporta</b>. ' +
        'Il solo codice di ripristino non basta: senza un server, i dati viaggiano con te.</p>' +
      '<textarea class="campo" id="pacco" placeholder="Incolla qui il backup" style="min-height:130px"></textarea>' +
      '<button class="btn btn-oro btn-pieno" id="vai" style="margin-top:12px">Ripristina</button>',
      function (foglioEl, chiudi) {
        foglioEl.querySelector('#vai').addEventListener('click', function () {
          var r = Readda.Store.importa(foglioEl.querySelector('#pacco').value);
          if (!r.ok) { Readda.Ui.brindisi(r.err); return; }
          chiudi();
          Readda.Ui.brindisi('Bentornato, ' + r.nick);
          Readda.App.vai(Readda.Store.profilo().completo ? '#/feed' : '#/inizio');
        });
      }
    );
  }

  return { disegna: disegna };
})();
