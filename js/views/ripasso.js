/* Readda — ripasso. Due prove diverse, perche' ricordare e usare
 * sono due abilita' diverse:
 *   riconoscimento -> scegli la definizione giusta (parole ignote)
 *   produzione     -> scrivi una frase vera che la contenga (parole passive)
 */
window.Readda = window.Readda || {};

Readda.Ripasso = (function () {
  var U, S, sessione = [], i = 0, fatte = 0;

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    sessione = Readda.Srs.scadenze(S.tutteLeParole()).slice(0, 20);
    // la produzione viene prima: e' li' che si guadagna
    sessione.sort(function (a, b) {
      if (a.tipo === b.tipo) return b.ritardo - a.ritardo;
      return a.tipo === 'produzione' ? -1 : 1;
    });
    i = 0; fatte = 0;
    if (!sessione.length) { nulla(); return; }
    // le voci in scadenza possono stare in blocchi non ancora caricati
    U.rendi('<div class="attesa"><span></span><span></span><span></span></div>');
    Readda.Corpus.assicura(sessione.map(function (x) { return x.id; }), render);
  }

  function nulla() {
    var passive = S.perStato('passiva').length;
    U.rendi(
      '<div class="testata"><div><h1>Ripasso</h1><p>Niente in scadenza adesso.</p></div></div>' +
      '<div class="vuoto">' +
        '<span class="segno">✓</span>' +
        '<p>Sei in pari.<br>' +
        (passive > 0
          ? U.plurale(passive, 'parola è', 'parole sono') + ' in attesa di essere usate: tornano da sole.'
          : 'Scorri il flusso per riempire la raccolta.') +
        '</p>' +
        '<button class="btn btn-filo" id="al-feed" style="margin-top:20px">Torna al flusso</button>' +
      '</div>'
    );
    U.uno('#al-feed').addEventListener('click', function () { Readda.App.vai('#/feed'); });
  }

  function render() {
    if (i >= sessione.length) { chiusura(); return; }
    var voce = sessione[i];
    var l = U.lemmaPerId(voce.id);
    if (!l) { i++; render(); return; }
    if (voce.tipo === 'produzione') provaProduzione(l, voce); else provaRiconoscimento(l, voce);
  }

  function intestazione() {
    return '<div class="contatore"><span class="occhiello">Ripasso</span>' +
      '<span>' + (i + 1) + ' di ' + sessione.length + '</span></div>';
  }

  /* ---------- riconoscimento ---------- */
  function provaRiconoscimento(l) {
    var opzioni = Readda.Srs.mescola(
      [{ t: l.def, g: true }].concat(
        Readda.Srs.distrattori(l, 3).map(function (d) { return { t: d, g: false }; })
      )
    );
    // con pochi blocchi caricati i distrattori possono essere meno di tre:
    // una scelta multipla con due opzioni e' inutile, meglio saltarla
    if (opzioni.length < 3) { i++; render(); return; }

    U.rendi(
      intestazione() +
      '<div class="ripasso">' +
        '<div class="prova">' +
          '<span class="occhiello">Che cosa significa</span>' +
          '<h2 class="lemma" style="margin-top:10px">' + U.esc(l.lemma) + '</h2>' +
          '<p class="sillabe">' + U.esc(l.sill) + ' · <span style="color:var(--inchiostro-3)">' + U.esc(l.pos) + '</span></p>' +
          '<div class="opzioni">' +
            opzioni.map(function (o, k) {
              return '<button class="opz" data-k="' + k + '" data-g="' + o.g + '">' + U.esc(o.t) + '</button>';
            }).join('') +
          '</div>' +
          '<div id="esito"></div>' +
        '</div>' +
      '</div>'
    );

    var risposto = false;
    U.su('.opz', 'click', function (e) {
      if (risposto) return;
      risposto = true;
      var giusto = e.currentTarget.getAttribute('data-g') === 'true';
      var nodi = document.querySelectorAll('.opz');
      for (var k = 0; k < nodi.length; k++) {
        if (nodi[k].getAttribute('data-g') === 'true') nodi[k].classList.add('giusta');
        else if (nodi[k] === e.currentTarget) nodi[k].classList.add('sbagliata');
      }
      S.registraProva(l.id, giusto);
      var p = S.parola(l.id);
      // l'esempio manca su tre voci su quattro: senza questo controllo
      // la risposta sbagliata diceva "Non ancora." e poi il vuoto
      var testo = giusto
        ? '<b>Esatto.</b> Torna ' + U.quando(p.prox) + '.' +
          (p.stato === 'passiva' ? '<br>Ora la riconosci: il prossimo passo è usarla in una frase tua.' : '')
        : '<b>Non ancora.</b> ' + U.esc(l.def) +
          (l.es ? '<br><i>' + U.esc(l.es) + '</i>' : '') +
          '<br>Torna ' + U.quando(p.prox) + '.';
      U.uno('#esito').innerHTML = '<div class="esito">' + testo + '</div>' +
        '<button class="btn btn-oro btn-pieno" id="avanti" style="margin-top:14px">Avanti</button>';
      U.uno('#avanti').addEventListener('click', function () { fatte++; i++; render(); });
      U.uno('#avanti').focus();
    });
  }

  /* ---------- produzione ---------- */
  function provaProduzione(l) {
    var p = S.parola(l.id);
    var quanti = p.usi.length;
    var richiamo = p.bluff
      ? 'Avevi detto di usarla. Dimostralo.'
      : (quanti === 0 ? 'La conosci. Adesso falla uscire.' : 'Ancora una, diversa dalle altre.');

    U.rendi(
      intestazione() +
      '<div class="ripasso">' +
        '<div class="prova">' +
          '<span class="occhiello">' + U.esc(richiamo) + '</span>' +
          '<h2 class="lemma" style="margin-top:10px">' + U.esc(l.lemma) + '</h2>' +
          '<p class="pos" style="margin-top:8px">' + U.esc(l.def) + '</p>' +
          '<textarea class="campo" id="frase" style="margin-top:22px" ' +
            'placeholder="Scrivi una frase tua con «' + U.esc(l.lemma) + '»"></textarea>' +
          '<div id="esito"></div>' +
          '<button class="btn btn-oro btn-pieno" id="conferma" style="margin-top:12px" disabled>Conferma</button>' +
          '<button class="btn btn-muto btn-pieno" id="salta" style="margin-top:8px">Non mi viene, rimandala</button>' +
          (quanti ? '<p style="margin:18px 0 0;font-size:12px;color:var(--inchiostro-3)">' +
             U.plurale(quanti, 'frase già scritta', 'frasi già scritte') + ' · a tre diventa tua</p>' : '') +
        '</div>' +
      '</div>'
    );

    var campo = U.uno('#frase'), bottone = U.uno('#conferma');
    campo.addEventListener('input', function () {
      bottone.disabled = campo.value.trim().split(/\s+/).length < 3;
    });
    setTimeout(function () { campo.focus(); }, 260);

    bottone.addEventListener('click', function () {
      var frase = campo.value.trim();
      if (!Readda.Srs.contiene(frase, l.lemma)) {
        U.uno('#esito').innerHTML =
          '<div class="esito" style="border-left-color:var(--rosa)">' +
          '<b style="color:var(--rosa)">Manca la parola.</b> La frase deve contenere ' +
          '«' + U.esc(l.lemma) + '», anche coniugata o al plurale.</div>';
        return;
      }
      S.registraUso(l.id, frase);
      var dopo = S.parola(l.id);
      U.uno('#esito').innerHTML = '<div class="esito">' +
        (dopo.stato === 'attiva'
          ? '<b>Tre frasi: adesso è tua.</b> Esce dal ripasso e resta nella raccolta.'
          : '<b>Registrata.</b> Te la richiedo ' + U.quando(dopo.prox) + '.') +
        '</div>';
      bottone.textContent = 'Avanti';
      bottone.disabled = false;
      campo.disabled = true;
      bottone.replaceWith(bottone.cloneNode(true));
      U.uno('#conferma').addEventListener('click', function () { fatte++; i++; render(); });
    });

    U.uno('#salta').addEventListener('click', function () {
      var w = S.parola(l.id);
      w.prox = Date.now() + Readda.Srs.intervallo(Math.max(w.box - 1, 0));
      w.bluff = false;
      S.salva();
      i++; render();
    });
  }

  function chiusura() {
    U.rendi(
      '<div class="testata"><div><h1>Finito.</h1><p>' +
        U.plurale(fatte, 'parola ripassata', 'parole ripassate') + ' in questa sessione.</p></div></div>' +
      '<div class="vuoto"><span class="segno">✓</span>' +
      '<p>Le prossime tornano da sole, quando serve.</p>' +
      '<button class="btn btn-oro" id="al-feed" style="margin-top:20px">Torna al flusso</button></div>'
    );
    Readda.Notifiche.aggiornaPallino();
    U.uno('#al-feed').addEventListener('click', function () { Readda.App.vai('#/feed'); });
  }

  return { disegna: disegna };
})();
