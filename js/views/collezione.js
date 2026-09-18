/* Readda — la raccolta. Tre stati, ma non hanno lo stesso peso:
 * le passive ("cuore spezzato") sono la lista che conta e stanno per prime. */
window.Readda = window.Readda || {};

Readda.Collezione = (function () {
  var U, S, filtro = 'passiva';

  var FILTRI = [
    { v: 'passiva', t: 'Da usare',   icona: 'passiva', classe: 'i-rosa' },
    { v: 'ignota',  t: 'Da imparare', icona: 'ignota',  classe: 'i-oro' },
    { v: 'attiva',  t: 'Mie',         icona: 'attiva',  classe: 'i-salvia' }
  ];

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    var tutti = [];
    ['passiva', 'ignota', 'attiva'].forEach(function (st) { tutti = tutti.concat(S.perStato(st)); });
    if (!tutti.length) { render(); return; }
    U.rendi('<div class="attesa"><span></span><span></span><span></span></div>');
    Readda.Corpus.assicura(tutti, render);
  }

  function render() {
    var conteggi = {};
    FILTRI.forEach(function (f) { conteggi[f.v] = S.perStato(f.v).length; });

    var ids = S.perStato(filtro).sort(function (a, b) {
      var pa = S.parola(a), pb = S.parola(b);
      return (pa.prox || Infinity) - (pb.prox || Infinity);
    });

    var conf = FILTRI.filter(function (f) { return f.v === filtro; })[0];

    var elenco = ids.length
      ? '<div class="elenco">' + ids.map(function (id) {
          var l = U.lemmaPerId(id); if (!l) return '';
          var p = S.parola(id);
          var coda = filtro === 'attiva'
            ? (p.usi.length ? U.plurale(p.usi.length, 'frase', 'frasi') : 'nota')
            : (p.prox ? U.quando(p.prox) : '—');
          return '<button class="voce" data-id="' + U.esc(id) + '">' +
            '<span class="icona ' + conf.classe + '">' + U.icona(conf.icona) + '</span>' +
            '<span class="voce-corpo"><b>' + U.esc(l.lemma) + '</b>' +
            '<small>' + U.esc(l.def) + '</small></span>' +
            '<span class="stato">' + U.esc(coda) + '</span></button>';
        }).join('') + '</div>'
      : vuoto();

    U.rendi(
      '<div class="testata"><div><h1>Raccolta</h1>' +
        '<p>' + U.esc(S.contaVisti()) + ' parole incontrate · ' +
        U.esc(conteggi.passiva) + ' aspettano di essere usate</p></div></div>' +
      '<div class="filtri">' +
        FILTRI.map(function (f) {
          return '<button class="filtro" data-f="' + f.v + '" aria-pressed="' + (filtro === f.v) + '">' +
            U.esc(f.t) + ' · ' + conteggi[f.v] + '</button>';
        }).join('') +
      '</div>' + elenco
    );

    U.su('.filtro', 'click', function (e) { filtro = e.currentTarget.getAttribute('data-f'); render(); });
    U.su('.voce', 'click', function (e) { apri(e.currentTarget.getAttribute('data-id')); });
  }

  function vuoto() {
    var testi = {
      passiva: 'Nessuna parola in attesa.<br>Nel flusso, tocca <b>«La conosco, non la uso»</b>: è la scelta che fa crescere davvero il lessico.',
      ignota:  'Nessuna parola da imparare.<br>Sei sicuro di star scorrendo abbastanza in alto?',
      attiva:  'Ancora nessuna parola tua.<br>Una parola diventa tua dopo tre frasi scritte nel ripasso.'
    };
    return '<div class="vuoto"><span class="segno">· · ·</span><p>' + testi[filtro] + '</p></div>';
  }

  function apri(id) {
    var l = U.lemmaPerId(id), p = S.parola(id);
    if (!l) return;
    p = p || {};
    p.usi = p.usi || []; p.ok = p.ok || 0; p.ko = p.ko || 0;
    var usi = p.usi.length
      ? '<div style="margin-top:22px"><span class="occhiello">Le tue frasi</span>' +
        p.usi.map(function (u) {
          return '<p class="esempio" style="margin-top:12px">' + U.esc(u.testo) + '</p>';
        }).join('') + '</div>'
      : '';

    U.foglio(
      '<div class="carta-alto">' +
        '<div class="etichette">' + l.dom.slice(0, 2).map(function (d) {
          return '<span class="pill">' + U.esc(U.nomeDominio(d)) + '</span>';
        }).join('') + '</div>' +
      '</div>' +
      '<h2 class="lemma" style="font-size:38px">' + U.esc(l.lemma) + '</h2>' +
      '<p class="sillabe">' + U.esc(l.sill) + '</p>' +
      '<p class="pos">' + U.esc(l.pos) + '</p>' +
      '<p class="definizione">' + U.esc(l.def) + '</p>' +
      '<p class="esempio">' + U.esc(l.es) + '</p>' +
      '<div class="sinonimi">' + l.sin.map(function (s) {
        return '<span class="sin">' + U.esc(s) + '</span>';
      }).join('') + '</div>' +
      usi +
      '<p style="margin-top:22px;font-size:12.5px;color:var(--inchiostro-3)">' +
        (p.prox ? 'Prossimo ripasso ' + U.esc(U.quando(p.prox)) : 'Fuori dal ripasso') +
        ' · ' + p.ok + ' giuste, ' + p.ko + ' sbagliate</p>' +
      (p.curato ? '' :
        '<p style="margin-top:20px;font-size:11px;color:var(--inchiostro-4);line-height:1.5">' +
        'Definizione dal Wikizionario italiano, CC BY-SA 3.0, con modifiche.</p>') +
      '<button class="btn btn-muto btn-pieno" id="togli" style="margin-top:18px">Toglila dalla raccolta</button>',
      function (foglioEl, chiudi) {
        foglioEl.querySelector('#togli').addEventListener('click', function () {
          S.dimentica(id); chiudi(); render();
          Readda.Ui.brindisi('«' + l.lemma + '» tolta');
          Readda.Notifiche.aggiornaPallino();
        });
      }
    );
  }

  return { disegna: disegna };
})();
