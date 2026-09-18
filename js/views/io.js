/* Readda — profilo, numeri, promemoria, backup. */
window.Readda = window.Readda || {};

Readda.Io = (function () {
  var U, S;

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    var p = S.profilo();
    var passive = S.perStato('passiva').length;
    var attive = S.perStato('attiva').length;
    var striscia = S.strisciaViva();
    var frasi = 0, parole = S.tutteLeParole();
    for (var k in parole) if (parole.hasOwnProperty(k)) frasi += parole[k].usi.length;

    var perm = Readda.Notifiche.permesso();
    var attive_notifiche = S.impostazioni().notifiche && perm === 'granted';

    U.rendi(
      '<div class="testata"><div><h1>' + U.esc(p.nick) + '</h1>' +
        '<p>' + U.esc(U.nomeDominio(p.lavoro)) + ' · ' +
        U.plurale((p.interessi || []).length, 'interesse', 'interessi') + '</p></div></div>' +

      '<div class="io">' +
        '<div class="numeri">' +
          '<div class="numero"><span class="n rosa">' + passive + '</span><small>Da usare</small></div>' +
          '<div class="numero"><span class="n">' + frasi + '</span><small>Frasi scritte</small></div>' +
          '<div class="numero"><span class="n oro">' + striscia + '</span><small>Giorni di fila</small></div>' +
        '</div>' +

        '<div class="riquadro">' +
          '<h3>Parole diventate tue</h3>' +
          '<p>' + attive + ' su ' + S.contaVisti() + ' incontrate. ' +
            'Una parola conta come tua dopo tre frasi scritte da te, non dopo un tocco su «lo so».</p>' +
        '</div>' +

        '<div class="riquadro">' +
          '<div class="riga"><div style="flex:1">' +
            '<h3>Promemoria</h3>' +
            '<p id="nota-notifiche">' + (perm === 'denied'
              ? 'Il browser li ha bloccati: vanno riattivati dalle impostazioni del sito.'
              : 'Ti scrivo quando una parola è pronta per essere richiesta.') + '</p>' +
          '</div>' +
          '<button class="interruttore" id="sw-notifiche" role="switch" ' +
            'aria-checked="' + attive_notifiche + '" aria-label="Promemoria"></button></div>' +
          '<p style="margin-top:14px;font-size:12px;color:var(--inchiostro-3);line-height:1.5">' +
            'Senza un server, il browser può avvisarti solo mentre Readda è aperta o da poco chiusa. ' +
            'Vedi il README per il passo successivo.</p>' +
        '</div>' +

        '<div class="riquadro">' +
          '<h3>Dose giornaliera</h3>' +
          '<p>Quante parole nuove al giorno. Poche e digerite battono molte e dimenticate.</p>' +
          '<div class="filtri" style="padding:14px 0 0">' +
            [10, 15, 25, 40].map(function (n) {
              return '<button class="filtro" data-dose="' + n + '" aria-pressed="' +
                (S.impostazioni().dose === n) + '">' + n + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="riquadro">' +
          '<div class="riga"><div style="flex:1">' +
            '<h3>Lessico esplicito</h3>' +
            '<p>' + U.esc(Readda.Corpus.manifesto().espliciti || 0) + ' voci volgari o sessualmente ' +
              'esplicite restano fuori dal flusso. Sono nel corpus, non cancellate: ' +
              'accendi per vederle anche tu.</p>' +
          '</div>' +
          '<button class="interruttore" id="sw-esplicito" role="switch" ' +
            'aria-checked="' + (S.impostazioni().esplicito === true) + '" ' +
            'aria-label="Lessico esplicito"></button></div>' +
        '</div>' +

        '<div class="riquadro">' +
          '<h3>Interessi</h3>' +
          '<p>Rifai le tre domande per cambiare quello che ti arriva nel flusso.</p>' +
          '<button class="btn btn-filo btn-pieno" id="rifai">Rivedi le preferenze</button>' +
        '</div>' +

        '<div class="riquadro">' +
          '<h3>Da dove vengono le parole</h3>' +
          '<p>' + U.esc(Readda.Corpus.totale().toLocaleString('it-IT')) + ' voci, di cui ' +
            U.esc(Readda.Corpus.manifesto().curati || 0) + ' scritte a mano. ' +
            'Le altre vengono dal <b>Wikizionario italiano</b>, ripulite e filtrate: ' +
            'restano solo le parole che si riconoscono ma non si usano.</p>' +
          '<p style="margin-top:10px;font-size:12px;color:var(--inchiostro-3);line-height:1.5">' +
            'Testi delle definizioni: Wikizionario, licenza ' +
            '<a href="https://creativecommons.org/licenses/by-sa/3.0/deed.it" target="_blank" ' +
            'rel="noopener" style="color:var(--oro-tenue)">CC BY-SA 3.0</a>, con modifiche. ' +
            'Chi ridistribuisce questo corpus deve mantenere la stessa licenza.</p>' +
        '</div>' +

        '<div class="riquadro">' +
          '<h3>Backup</h3>' +
          '<p>I dati stanno solo in questo browser. Esporta una stringa e conservala: ' +
             'è l’unico modo per ritrovarli altrove.</p>' +
          '<button class="btn btn-filo btn-pieno" id="esporta">Esporta i miei dati</button>' +
          '<p style="margin-top:12px;font-size:12px;color:var(--inchiostro-3)">Codice di ripristino: ' +
            '<span style="color:var(--oro-tenue);font-family:ui-monospace,monospace">' + U.esc(p.codice) + '</span></p>' +
        '</div>' +

        '<button class="btn btn-muto btn-pieno" id="esci" style="margin-top:6px">Esci</button>' +
        '<button class="btn btn-muto btn-pieno" id="cancella" ' +
          'style="color:var(--rosa);border-color:rgba(232,146,124,.22)">Cancella questo account</button>' +
      '</div>'
    );

    U.uno('#sw-notifiche').addEventListener('click', commutaNotifiche);
    U.su('[data-dose]', 'click', function (e) {
      S.imposta('dose', parseInt(e.currentTarget.getAttribute('data-dose'), 10));
      disegna();
    });
    U.uno('#sw-esplicito').addEventListener('click', function () {
      var sw = U.uno('#sw-esplicito');
      var acceso = sw.getAttribute('aria-checked') === 'true';
      S.imposta('esplicito', !acceso);
      sw.setAttribute('aria-checked', String(!acceso));
      U.brindisi(acceso ? 'Lessico esplicito escluso dal flusso' : 'Lessico esplicito incluso');
    });
    U.uno('#rifai').addEventListener('click', function () { Readda.App.vai('#/inizio'); });
    U.uno('#esporta').addEventListener('click', apriEsporta);
    U.uno('#esci').addEventListener('click', function () {
      S.esci(); Readda.App.vai('#/entra');
    });
    U.uno('#cancella').addEventListener('click', confermaCancella);
  }

  function commutaNotifiche() {
    var sw = U.uno('#sw-notifiche');
    var acceso = sw.getAttribute('aria-checked') === 'true';
    if (acceso) {
      S.imposta('notifiche', false);
      sw.setAttribute('aria-checked', 'false');
      Readda.Notifiche.ferma();
      U.brindisi('Promemoria spenti');
      return;
    }
    if (!Readda.Notifiche.supportate()) { U.brindisi('Questo browser non li supporta'); return; }
    Readda.Notifiche.chiedi().then(function (esito) {
      if (esito !== 'granted') {
        U.brindisi('Permesso non concesso');
        U.uno('#nota-notifiche').textContent =
          'Il browser li ha bloccati: vanno riattivati dalle impostazioni del sito.';
        return;
      }
      S.imposta('notifiche', true);
      sw.setAttribute('aria-checked', 'true');
      Readda.Notifiche.avvia();
      U.brindisi('Promemoria accesi');
    });
  }

  function apriEsporta() {
    var pacco = S.esporta();
    U.foglio(
      '<h2 style="font-family:var(--serif);font-weight:400;font-size:24px;margin:0 0 6px;letter-spacing:-.02em">Il tuo backup</h2>' +
      '<p style="color:var(--inchiostro-3);font-size:13px;margin:0 0 16px;line-height:1.55">' +
        'Copialo e mettilo dove lo ritrovi. Su un altro dispositivo: schermata iniziale → ' +
        '<b>Ho già un codice di ripristino</b>.</p>' +
      '<textarea class="campo" id="pacco" readonly style="min-height:150px;font-size:11.5px;' +
        'font-family:ui-monospace,monospace">' + U.esc(pacco) + '</textarea>' +
      '<button class="btn btn-oro btn-pieno" id="copia" style="margin-top:12px">Copia</button>',
      function (foglioEl, chiudi) {
        foglioEl.querySelector('#copia').addEventListener('click', function () {
          var ta = foglioEl.querySelector('#pacco');
          ta.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pacco).then(
              function () { Readda.Ui.brindisi('Backup copiato'); chiudi(); },
              function () { Readda.Ui.brindisi('Selezionalo e copialo a mano'); }
            );
          } else {
            try { document.execCommand('copy'); Readda.Ui.brindisi('Backup copiato'); chiudi(); }
            catch (e) { Readda.Ui.brindisi('Selezionalo e copialo a mano'); }
          }
        });
      }
    );
  }

  function confermaCancella() {
    U.foglio(
      '<h2 style="font-family:var(--serif);font-weight:400;font-size:24px;margin:0 0 6px">Cancellare tutto?</h2>' +
      '<p style="color:var(--inchiostro-3);font-size:13.5px;margin:0 0 20px;line-height:1.55">' +
        'Spariscono le parole raccolte, le frasi scritte e la striscia di giorni. ' +
        'Non si torna indietro, a meno che tu non abbia un backup.</p>' +
      '<button class="btn btn-pieno" id="si" style="background:var(--rosa);color:#20140F;font-weight:600">Sì, cancella</button>' +
      '<button class="btn btn-muto btn-pieno" id="no" style="margin-top:8px">Lascia stare</button>',
      function (foglioEl, chiudi) {
        foglioEl.querySelector('#no').addEventListener('click', chiudi);
        foglioEl.querySelector('#si').addEventListener('click', function () {
          S.cancellaAccount(); chiudi(); Readda.App.vai('#/entra');
        });
      }
    );
  }

  return { disegna: disegna };
})();
