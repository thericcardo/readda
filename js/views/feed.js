/* Readda — il flusso.
 * Scorrimento continuo di lemmi, una carta alla volta. Tre giudizi:
 *   su      -> conosco completamente (passa oltre; a volte l'app bluffa e ricontrolla)
 *   sinistra-> non conosco          (entra nel ripasso a riconoscimento)
 *   destra  -> conosco ma non uso   (entra nel ripasso a produzione: vai scritto)
 */
window.Readda = window.Readda || {};

Readda.Feed = (function () {
  var U, S, coda = [], indice = 0, animando = false, scollegaTasti = null, rifornendo = false;

  /* Il giorno in cui si e' scelto di andare oltre la dose. La dose e' una
   * scelta di prodotto - poche e digerite battono molte e dimenticate - ma
   * un muro che manda via chi ha dieci minuti liberi sarebbe punitivo:
   * quindi il flusso si ferma, lo dice, e lascia una porta. Chi la apre non
   * se la ritrova chiusa in faccia a ogni cambio di scheda. */
  var doseIgnorataIl = null;

  function doseRaggiunta() {
    return S.nuoveOggi() >= S.impostazioni().dose && doseIgnorataIl !== S.oggiISO();
  }

  var SOGLIA = 96;          // px oltre i quali il trascinamento vale come scelta
  var SOGLIA_SU = 110;

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    coda = []; indice = 0;

    U.rendi(
      '<div class="feed">' +
        '<div class="feed-testa">' +
          '<span class="occhiello">Flusso</span>' +
          '<span class="dose"><span id="dose-txt">0 / ' + U.esc(S.impostazioni().dose) + '</span>' +
            '<span class="dose-barra"><i id="dose-barra"></i></span></span>' +
        '</div>' +
        // la pila si riscrive per intero a ogni giudizio: senza una regione
        // viva, chi usa un lettore di schermo non sa che la carta e' cambiata
        '<div class="pila" id="pila" role="region" aria-live="polite" ' +
             'aria-atomic="true" aria-label="Carta del flusso"></div>' +
        '<div class="azioni" id="azioni">' +
          '<button class="azione az-ignota" data-giudizio="ignota">' +
            U.icona('ignota') + '<b>Non la conosco</b><small>Salvala e insegnamela</small></button>' +
          '<button class="azione az-passiva" data-giudizio="passiva">' +
            U.icona('passiva') + '<b>La conosco, non la uso</b><small>Aiutami a tirarla fuori</small></button>' +
          '<button class="azione az-attiva" data-giudizio="attiva">' +
            U.icona('attiva') + '<b>La uso già</b><small>Vai avanti</small></button>' +
        '</div>' +
        '<div class="scorciatoie">trascina la carta · oppure 1 2 3 da tastiera</div>' +
      '</div>'
    );

    U.su('[data-giudizio]', 'click', function (e) {
      giudica(e.currentTarget.getAttribute('data-giudizio'));
    });
    collegaTasti();
    aggiornaDose();
    // con la dose gia' raggiunta non serve nemmeno scaricare i blocchi
    if (doseRaggiunta()) { pausa(); return; }
    apri();
  }

  /* Il corpus vive in blocchi: se ne carica una manciata, non tutto. */
  function apri() {
    attendi();
    Readda.Corpus.allarga(4, function () {
      coda = Readda.Srs.coda(S.profilo(), S.tutteLeParole(), 120, S.impostazioni().esplicito);
      indice = 0;
      mostra();
    });
  }

  function attendi() {
    var pila = U.uno('#pila');
    if (pila) pila.innerHTML = '<div class="attesa"><span></span><span></span><span></span></div>';
  }

  /* Quando la coda si assottiglia si aggiungono altri blocchi, senza
   * interrompere chi sta scorrendo. */
  function rifornisci() {
    if (rifornendo || coda.length - indice > 10) return;
    rifornendo = true;
    Readda.Corpus.allarga(3, function (ancora) {
      rifornendo = false;
      if (!ancora) return;
      var nuova = Readda.Srs.coda(S.profilo(), S.tutteLeParole(), 120, S.impostazioni().esplicito);
      var visti = {};
      for (var i = 0; i <= indice && i < coda.length; i++) visti[coda[i].id] = true;
      for (var j = 0; j < nuova.length; j++) {
        if (!visti[nuova[j].id] && coda.indexOf(nuova[j]) < 0) coda.push(nuova[j]);
      }
      if (indice >= coda.length - 1) mostra();
    });
  }

  function smonta() { if (scollegaTasti) { scollegaTasti(); scollegaTasti = null; } }

  /* I tasti valgono solo quando c'e' una carta davanti. Senza questo
   * controllo, sulla schermata di pausa (o su quella di fine flusso) uno
   * spazio giudicava una parola mai vista - e, siccome preventDefault()
   * partiva comunque, non azionava nemmeno il bottone su cui stava il
   * fuoco: chi usa la tastiera restava chiuso dentro, perdendo una parola
   * a ogni tentativo di uscire. */
  function collegaTasti() {
    function onTasto(e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!U.uno('#carta-viva')) return;
      if (e.key === '1') giudica('ignota');
      else if (e.key === '2') giudica('passiva');
      else if (e.key === '3' || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); giudica('attiva'); }
    }
    document.addEventListener('keydown', onTasto);
    scollegaTasti = function () { document.removeEventListener('keydown', onTasto); };
  }

  /* La carta dietro e' l'effetto pila: mostra il lemma successivo per far
   * vedere che il flusso continua. E' decorazione, e letta ad alta voce
   * annuncerebbe due parole quando ne e' arrivata una. I timbri sono
   * l'anteprima del gesto di trascinamento, e la sillabazione ripete il
   * lemma con i puntini in mezzo: nessuno dei tre va detto. */
  function cartaHtml(l, dietro) {
    var pallini = '';
    for (var i = 1; i <= 3; i++) pallini += '<i class="' + (i <= l.lvl ? 'on' : '') + '"></i>';
    return '' +
      '<article class="carta' + (dietro ? ' dietro' : ' entra') + '"' +
        (dietro ? ' aria-hidden="true"' : ' id="carta-viva"') + '>' +
        '<div class="timbro sx" aria-hidden="true">Non la so</div>' +
        '<div class="timbro dx" aria-hidden="true">Non la uso</div>' +
        '<div class="timbro su" aria-hidden="true">La uso</div>' +
        '<div class="carta-alto">' +
          '<div class="etichette">' +
            '<span class="pill marcata">' + U.esc(U.nomeDominio(l.dom[0])) + '</span>' +
            '<span class="pill">' + U.esc(l.reg) + '</span>' +
          '</div>' +
          '<div class="livello" title="rarità" aria-label="' +
            U.esc('rarità ' + l.lvl + ' su 3') + '">' + pallini + '</div>' +
        '</div>' +
        '<h2 class="lemma">' + U.esc(l.lemma) + '</h2>' +
        '<p class="sillabe" aria-hidden="true">' + U.esc(l.sill) + '</p>' +
        '<p class="pos">' + U.esc(l.pos) + '</p>' +
        '<p class="definizione">' + U.esc(l.def) + '</p>' +
        (l.es ? '<p class="esempio">' + U.esc(l.es) + '</p>' : '') +
        '<div class="sinonimi">' +
          l.sin.slice(0, 4).map(function (s) { return '<span class="sin">' + U.esc(s) + '</span>'; }).join('') +
        '</div>' +
      '</article>';
  }

  function azioni(visibili) {
    var el = U.uno('#azioni');
    if (el) el.style.display = visibili ? '' : 'none';
  }

  function mostra() {
    var pila = U.uno('#pila');
    if (!pila) return;
    if (doseRaggiunta()) { pausa(); return; }
    rifornisci();
    if (indice >= coda.length) { finito(); return; }
    var prossima = coda[indice + 1];
    pila.innerHTML = (prossima ? cartaHtml(prossima, true) : '') + cartaHtml(coda[indice], false);
    // pausa() e finito() le nascondono: se una carta ricompare - per esempio
    // perche' un rifornimento e' arrivato dopo la schermata di fine - vanno
    // rimesse, altrimenti resta una carta senza i suoi tre bottoni
    azioni(true);
    collegaTrascinamento(U.uno('#carta-viva'));
  }

  /* Dose raggiunta: il flusso si ferma e propone il ripasso, che e' il
   * lavoro che rende di piu' una volta che le parole nuove sono entrate. */
  function pausa() {
    var d = Readda.Notifiche.dovute();
    var dose = S.impostazioni().dose;
    U.uno('#pila').innerHTML =
      '<div class="vuoto">' +
        '<span class="segno">\u2713</span>' +
        '<p>' + U.plurale(dose, 'parola nuova oggi', 'parole nuove oggi') +
        ': la dose \u00e8 completa.<br>' +
        (d.totale > 0
          ? U.plurale(d.totale, 'parola aspetta', 'parole aspettano') + ' nel ripasso, ' +
            'e consolidare rende pi\u00f9 che aggiungere.'
          : 'Da qui in poi si aggiunge senza digerire. Domani il flusso riparte.') +
        '</p>' +
        (d.totale > 0 ? '<button class="btn btn-oro" id="vai-ripasso" style="margin-top:20px">Vai al ripasso</button>' : '') +
        '<button class="btn btn-muto" id="oltre" style="margin-top:10px">Continua lo stesso</button>' +
      '</div>';
    azioni(false);
    var b = U.uno('#vai-ripasso');
    if (b) b.addEventListener('click', function () { Readda.App.vai('#/ripasso'); });
    U.uno('#oltre').addEventListener('click', function () {
      doseIgnorataIl = S.oggiISO();
      azioni(true);
      // se la pausa e' comparsa all'apertura, i blocchi non sono mai stati
      // caricati e la coda e' vuota: va composta adesso
      if (coda.length > indice) mostra(); else apri();
    });
  }

  function finito() {
    var d = Readda.Notifiche.dovute();
    U.uno('#pila').innerHTML =
      '<div class="vuoto">' +
        '<span class="segno">· · ·</span>' +
        '<p>Per oggi il flusso è finito.<br>' +
        (d.totale > 0
          ? 'Ma ' + U.plurale(d.totale, 'parola aspetta', 'parole aspettano') + ' nel ripasso.'
          : 'Torna domani: le parole nuove arrivano con calma, apposta.') +
        '</p>' +
        (d.totale > 0 ? '<button class="btn btn-oro" id="vai-ripasso" style="margin-top:20px">Vai al ripasso</button>' : '') +
      '</div>';
    azioni(false);
    var b = U.uno('#vai-ripasso');
    if (b) b.addEventListener('click', function () { Readda.App.vai('#/ripasso'); });
  }

  /* Conta le parole nuove, non tutto cio' che si e' toccato oggi: la dose
   * promette "quante parole nuove al giorno", e un ripasso non e' una parola
   * nuova. Prima la barra saliva anche stando fermi nel ripasso. */
  function aggiornaDose() {
    var nuove = S.nuoveOggi(), dose = S.impostazioni().dose;
    var t = U.uno('#dose-txt'), b = U.uno('#dose-barra');
    if (t) t.textContent = Math.min(nuove, dose) + ' / ' + dose;
    if (b) b.style.width = Math.min(100, (nuove / dose) * 100) + '%';
  }

  /* ---- trascinamento ---- */
  function collegaTrascinamento(carta) {
    if (!carta) return;
    var giu = false, x0 = 0, y0 = 0, dx = 0, dy = 0;
    var tSx = carta.querySelector('.timbro.sx'),
        tDx = carta.querySelector('.timbro.dx'),
        tSu = carta.querySelector('.timbro.su');

    carta.addEventListener('pointerdown', function (e) {
      if (animando) return;
      giu = true; x0 = e.clientX; y0 = e.clientY;
      carta.setPointerCapture(e.pointerId);
      carta.style.transition = 'none';
    });

    carta.addEventListener('pointermove', function (e) {
      if (!giu) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      var rot = dx / 26;
      carta.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
      tSx.style.opacity = dx < -20 ? Math.min(1, (-dx - 20) / 70) : 0;
      tDx.style.opacity = dx > 20 ? Math.min(1, (dx - 20) / 70) : 0;
      tSu.style.opacity = (dy < -20 && Math.abs(dx) < 60) ? Math.min(1, (-dy - 20) / 80) : 0;
    });

    function rilascia(e) {
      if (!giu) return;
      giu = false;
      carta.style.transition = '';
      if (dy < -SOGLIA_SU && Math.abs(dx) < 80) giudica('attiva');
      else if (dx < -SOGLIA) giudica('ignota');
      else if (dx > SOGLIA) giudica('passiva');
      else {
        carta.style.transform = '';
        tSx.style.opacity = tDx.style.opacity = tSu.style.opacity = 0;
      }
      dx = dy = 0;
    }
    carta.addEventListener('pointerup', rilascia);
    carta.addEventListener('pointercancel', rilascia);
  }

  /* ---- giudizio ---- */
  var VOLI = {
    ignota:  'translate(-130%,10%) rotate(-18deg)',
    passiva: 'translate(130%,10%) rotate(18deg)',
    attiva:  'translate(0,-130%) scale(.9)'
  };

  function giudica(stato) {
    if (animando || indice >= coda.length) return;
    animando = true;
    var lemma = coda[indice];
    var carta = U.uno('#carta-viva');
    var p = S.segna(lemma.id, stato);

    if (carta) {
      carta.style.transition = 'transform .38s cubic-bezier(.4,0,.6,1), opacity .38s linear';
      carta.style.transform = VOLI[stato];
      carta.style.opacity = '0';
    }

    if (stato === 'passiva') {
      U.brindisi('«' + lemma.lemma + '»: te la richiedo scritta');
    } else if (stato === 'ignota') {
      U.brindisi('Salvata. Primo ripasso ' + U.quando(p.prox));
    } else if (p && p.bluff) {
      U.brindisi('Bene. Fra due giorni te la faccio dimostrare');
    }

    setTimeout(function () {
      indice++;
      animando = false;
      aggiornaDose();
      rifornisci();
      Readda.Notifiche.aggiornaPallino();
      mostra();
    }, 300);
  }

  return { disegna: disegna, smonta: smonta };
})();
