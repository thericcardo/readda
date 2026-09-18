/* Readda — il flusso.
 * Scorrimento continuo di lemmi, una carta alla volta. Tre giudizi:
 *   su      -> conosco completamente (passa oltre; a volte l'app bluffa e ricontrolla)
 *   sinistra-> non conosco          (entra nel ripasso a riconoscimento)
 *   destra  -> conosco ma non uso   (entra nel ripasso a produzione: vai scritto)
 */
window.Readda = window.Readda || {};

Readda.Feed = (function () {
  var U, S, coda = [], indice = 0, animando = false, scollegaTasti = null, rifornendo = false;

  var SOGLIA = 96;          // px oltre i quali il trascinamento vale come scelta
  var SOGLIA_SU = 110;

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    coda = []; indice = 0;

    U.rendi(
      '<div class="feed">' +
        '<div class="feed-testa">' +
          '<span class="occhiello">Flusso</span>' +
          '<span class="dose"><span id="dose-txt">0 / ' + S.impostazioni().dose + '</span>' +
            '<span class="dose-barra"><i id="dose-barra"></i></span></span>' +
        '</div>' +
        '<div class="pila" id="pila"></div>' +
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
    attendi();

    // il corpus vive in blocchi: se ne carica una manciata, non tutto
    Readda.Corpus.allarga(4, function () {
      coda = Readda.Srs.coda(S.profilo(), S.tutteLeParole(), 120, S.impostazioni().esplicito);
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

  function collegaTasti() {
    function onTasto(e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === '1') giudica('ignota');
      else if (e.key === '2') giudica('passiva');
      else if (e.key === '3' || e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); giudica('attiva'); }
    }
    document.addEventListener('keydown', onTasto);
    scollegaTasti = function () { document.removeEventListener('keydown', onTasto); };
  }

  function cartaHtml(l, dietro) {
    var pallini = '';
    for (var i = 1; i <= 3; i++) pallini += '<i class="' + (i <= l.lvl ? 'on' : '') + '"></i>';
    return '' +
      '<article class="carta' + (dietro ? ' dietro' : ' entra') + '"' + (dietro ? '' : ' id="carta-viva"') + '>' +
        '<div class="timbro sx">Non la so</div>' +
        '<div class="timbro dx">Non la uso</div>' +
        '<div class="timbro su">La uso</div>' +
        '<div class="carta-alto">' +
          '<div class="etichette">' +
            '<span class="pill marcata">' + U.esc(U.nomeDominio(l.dom[0])) + '</span>' +
            '<span class="pill">' + U.esc(l.reg) + '</span>' +
          '</div>' +
          '<div class="livello" title="rarità">' + pallini + '</div>' +
        '</div>' +
        '<h2 class="lemma">' + U.esc(l.lemma) + '</h2>' +
        '<p class="sillabe">' + U.esc(l.sill) + '</p>' +
        '<p class="pos">' + U.esc(l.pos) + '</p>' +
        '<p class="definizione">' + U.esc(l.def) + '</p>' +
        '<p class="esempio">' + U.esc(l.es) + '</p>' +
        '<div class="sinonimi">' +
          l.sin.slice(0, 4).map(function (s) { return '<span class="sin">' + U.esc(s) + '</span>'; }).join('') +
        '</div>' +
      '</article>';
  }

  function mostra() {
    var pila = U.uno('#pila');
    if (!pila) return;
    rifornisci();
    if (indice >= coda.length) { finito(); return; }
    var prossima = coda[indice + 1];
    pila.innerHTML = (prossima ? cartaHtml(prossima, true) : '') + cartaHtml(coda[indice], false);
    collegaTrascinamento(U.uno('#carta-viva'));
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
    U.uno('#azioni').style.display = 'none';
    var b = U.uno('#vai-ripasso');
    if (b) b.addEventListener('click', function () { Readda.App.vai('#/ripasso'); });
  }

  function aggiornaDose() {
    var fatte = S.fatteOggi(), dose = S.impostazioni().dose;
    var t = U.uno('#dose-txt'), b = U.uno('#dose-barra');
    if (t) t.textContent = Math.min(fatte, dose) + ' / ' + dose;
    if (b) b.style.width = Math.min(100, (fatte / dose) * 100) + '%';
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
