/* Readda — primo avvio: tre domande che servono a pesare il flusso.
 * Non sono un questionario di benvenuto: ogni risposta entra
 * nell'algoritmo di selezione dei lemmi (vedi Srs.coda). */
window.Readda = window.Readda || {};

Readda.Inizio = (function () {
  var U, S, passo = 0, bozza = { lavoro: null, interessi: [], obiettivo: null };

  var MESTIERI = [
    { v: 'scuola',     e: '✎', t: 'Scuola e università',  d: 'Insegno, studio o faccio ricerca' },
    { v: 'lavoro',     e: '◆', t: 'Ufficio e impresa',          d: 'Riunioni, mail, relazioni' },
    { v: 'diritto',    e: '⚖', t: 'Diritto e amministrazione',  d: 'Norme, atti, contratti' },
    { v: 'medicina',   e: '✚', t: 'Salute',                     d: 'Cura, assistenza, ricerca clinica' },
    { v: 'tecnologia', e: '▦', t: 'Tecnologia',                 d: 'Codice, dati, prodotto' },
    { v: 'arte',       e: '♪', t: 'Arte e comunicazione',       d: 'Scrivo, racconto, progetto' },
    { v: 'altro',      e: '∙', t: 'Altro',                      d: 'Nessuna di queste' }
  ];

  var TEMI = [
    { v: 'lingua',     t: 'Lingua e scrittura' },
    { v: 'pensiero',   t: 'Ragionamento e logica' },
    { v: 'emozioni',   t: 'Emozioni e carattere' },
    { v: 'politica',   t: 'Società e politica' },
    { v: 'natura',     t: 'Natura e paesaggio' },
    { v: 'cucina',     t: 'Cucina e tavola' },
    { v: 'tempo',      t: 'Tempo e misura' },
    { v: 'medicina',   t: 'Corpo e salute' },
    { v: 'tecnologia', t: 'Tecnologia' },
    { v: 'diritto',    t: 'Diritto' }
  ];

  var MIRE = [
    { v: 'base',  t: 'Parlare più preciso',   d: 'Parole comuni che uso male o non uso' },
    { v: 'medio', t: 'Scrivere meglio',            d: 'Registro più alto, senza sembrare finto' },
    { v: 'alto',  t: 'Riprendermi l’italiano', d: 'Anche i termini rari e letterari' }
  ];

  function disegna() {
    U = Readda.Ui; S = Readda.Store;
    passo = 0;
    var p = S.profilo();
    bozza = { lavoro: p.lavoro, interessi: (p.interessi || []).slice(), obiettivo: p.obiettivo };
    render();
  }

  function barra() {
    var out = '<div class="avanzamento">';
    for (var i = 0; i < 3; i++) out += '<i class="' + (i <= passo ? 'fatto' : '') + '"></i>';
    return out + '</div>';
  }

  function spunta() {
    return '<span class="spunta"><svg viewBox="0 0 24 24"><path d="m4 12 5.5 5.5L20 7"/></svg></span>';
  }

  function render() {
    var corpo, nota, pronto;

    if (passo === 0) {
      corpo = MESTIERI.map(function (m) {
        return '<button class="scelta" data-v="' + m.v + '" aria-pressed="' + (bozza.lavoro === m.v) + '">' +
          '<span class="emoji">' + m.e + '</span>' +
          '<span class="testo"><b>' + U.esc(m.t) + '</b><small>' + U.esc(m.d) + '</small></span>' +
          spunta() + '</button>';
      }).join('');
      nota = 'Le parole del tuo campo arrivano prima. Serve a farti incontrare lessico che userai davvero.';
      pronto = !!bozza.lavoro;
    } else if (passo === 1) {
      corpo = TEMI.map(function (t) {
        return '<button class="scelta" data-v="' + t.v + '" aria-pressed="' + (bozza.interessi.indexOf(t.v) >= 0) + '">' +
          '<span class="testo"><b>' + U.esc(t.t) + '</b></span>' + spunta() + '</button>';
      }).join('');
      nota = 'Scegline almeno due. Puoi cambiarle quando vuoi.';
      pronto = bozza.interessi.length >= 2;
    } else {
      corpo = MIRE.map(function (m) {
        return '<button class="scelta" data-v="' + m.v + '" aria-pressed="' + (bozza.obiettivo === m.v) + '">' +
          '<span class="testo"><b>' + U.esc(m.t) + '</b><small>' + U.esc(m.d) + '</small></span>' +
          spunta() + '</button>';
      }).join('');
      nota = 'Decide quanto in alto pesca il flusso. Non è un voto: si può alzare dopo.';
      pronto = !!bozza.obiettivo;
    }

    var domande = [
      'Di cosa ti occupi?',
      'Di cosa ti va di leggere?',
      'Dove vuoi arrivare?'
    ];

    U.rendi(
      barra() +
      '<div class="testata"><div><h1>' + U.esc(domande[passo]) + '</h1>' +
        '<p>' + U.esc(nota) + '</p></div></div>' +
      '<div class="passo"><div class="griglia-scelte">' + corpo + '</div></div>' +
      '<div class="pie-passo">' +
        '<button class="btn btn-oro btn-pieno" id="avanti"' + (pronto ? '' : ' disabled') + '>' +
        (passo === 2 ? 'Entra nel flusso' : 'Avanti') + '</button>' +
        (passo > 0 ? '<button class="btn btn-muto btn-pieno" id="indietro" style="margin-top:8px">Indietro</button>' : '') +
      '</div>',
      { senzaBarra: true }
    );

    U.su('.scelta', 'click', function (e) {
      var v = e.currentTarget.getAttribute('data-v');
      if (passo === 0) bozza.lavoro = v;
      else if (passo === 1) {
        var i = bozza.interessi.indexOf(v);
        if (i >= 0) bozza.interessi.splice(i, 1); else bozza.interessi.push(v);
      } else bozza.obiettivo = v;
      render();
    });

    U.uno('#avanti').addEventListener('click', function () {
      if (passo < 2) { passo++; render(); return; }
      S.aggiornaProfilo({
        lavoro: bozza.lavoro, interessi: bozza.interessi,
        obiettivo: bozza.obiettivo, completo: true
      });
      Readda.App.vai('#/feed');
    });
    var ind = U.uno('#indietro');
    if (ind) ind.addEventListener('click', function () { passo--; render(); });
  }

  return { disegna: disegna };
})();
