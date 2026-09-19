/* Readda — utilità di interfaccia condivise. */
window.Readda = window.Readda || {};

Readda.Ui = (function () {
  var schermo = null, brindisiEl = null, timerBrindisi = null;

  function init() {
    schermo = document.getElementById('schermo');
    brindisiEl = document.getElementById('brindisi');
  }

  /* HTML con escape automatico delle interpolazioni: html`...${x}...` */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function html(pezzi) {
    var out = pezzi[0];
    for (var i = 1; i < arguments.length; i++) out += esc(arguments[i]) + pezzi[i];
    return out;
  }
  /* per inserire HTML già costruito e fidato */
  function grezzo(s) { return { __html: s }; }

  function rendi(markup, opzioni) {
    opzioni = opzioni || {};
    schermo.className = 'schermo' + (opzioni.senzaBarra ? ' senza-barra' : '');
    schermo.innerHTML = markup;
    schermo.scrollTop = 0;
    window.scrollTo(0, 0);
    document.getElementById('barra').hidden = !!opzioni.senzaBarra;
    return schermo;
  }

  function su(selettore, evento, gestore, radice) {
    var nodi = (radice || schermo).querySelectorAll(selettore);
    for (var i = 0; i < nodi.length; i++) nodi[i].addEventListener(evento, gestore);
    return nodi;
  }
  function uno(selettore, radice) { return (radice || schermo).querySelector(selettore); }

  function brindisi(testo, ms) {
    brindisiEl.textContent = testo;
    brindisiEl.classList.add('su');
    clearTimeout(timerBrindisi);
    timerBrindisi = setTimeout(function () { brindisiEl.classList.remove('su'); }, ms || 2600);
  }

  /* Foglio modale che sale dal basso. onAperto riceve il nodo e la chiusura.
   *
   * Si chiude toccando fuori, e anche con Esc: toccare fuori e' un gesto che
   * esiste solo col dito o col puntatore, e senza Esc chi naviga da tastiera
   * restava dentro il foglio senza via d'uscita. Il fuoco entra nel foglio
   * all'apertura e torna dov'era alla chiusura, altrimenti un lettore di
   * schermo continua a leggere la pagina sotto. */
  function foglio(contenuto, onAperto) {
    var prima = document.activeElement;
    var velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="foglio" role="dialog" aria-modal="true" tabindex="-1">' +
                     '<div class="maniglia" aria-hidden="true"></div>' + contenuto + '</div>';
    document.body.appendChild(velo);

    function onTasto(e) { if (e.key === 'Escape') { e.preventDefault(); chiudi(); } }

    var chiuso = false;
    function chiudi() {
      if (chiuso) return;
      chiuso = true;
      document.removeEventListener('keydown', onTasto);
      velo.style.animation = 'sfuma .22s reverse both';
      setTimeout(function () { velo.remove(); }, 200);
      if (prima && prima.focus) prima.focus();
    }

    velo.addEventListener('click', function (e) { if (e.target === velo) chiudi(); });
    document.addEventListener('keydown', onTasto);

    var dentro = velo.querySelector('.foglio');
    var primoCampo = dentro.querySelector('input, textarea, button');
    (primoCampo || dentro).focus();

    if (onAperto) onAperto(dentro, chiudi);
    return chiudi;
  }

  var ICONE = {
    ignota:  '<path d="M12 17h.01M12 14c0-2 2.2-2.4 2.2-4.4A2.2 2.2 0 0 0 12 7.4a2.3 2.3 0 0 0-2.2 1.8"/><circle cx="12" cy="12" r="9"/>',
    passiva: '<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8c0 4.8-7 9.2-7 9.2Z"/><path d="m12 8-1.6 3.2 3 1.4L12 16"/>',
    attiva:  '<path d="m4 12 5.5 5.5L20 7"/>',
    penna:   '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
    fuoco:   '<path d="M12 21a5.5 5.5 0 0 0 5.5-5.5c0-4-4-5-3-9.5-3 1.5-5.5 4.5-5.5 8A2.5 2.5 0 0 0 11 16c-.5-2 1-3 1-3s-2 3 0 5a5.4 5.4 0 0 0 0 3Z"/>',
    campana: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 19a2 2 0 0 1-3.4 0"/>',
    giu:     '<path d="M12 5v14m0 0-5-5m5 5 5-5"/>'
  };
  function icona(nome, classe) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" class="' + (classe || '') + '">' + ICONE[nome] + '</svg>';
  }

  function lemmaPerId(id) { return Readda.Corpus.lemma(id); }

  var NOMI_DOMINIO = {
    lavoro: 'Lavoro', diritto: 'Diritto', politica: 'Società', pensiero: 'Ragionamento',
    scuola: 'Scuola', scienza: 'Scienza', lingua: 'Lingua', tecnologia: 'Tecnologia',
    emozioni: 'Emozioni', tempo: 'Tempo', storia: 'Storia', natura: 'Natura',
    medicina: 'Salute', cucina: 'Cucina', arte: 'Arte', generale: 'Generale',
    // "altro" non e' un dominio del corpus: e' la risposta "nessuna di
    // queste" alla prima domanda, e nella testata di Io compariva minuscola
    altro: 'Altro'
  };
  function nomeDominio(d) {
    if (!d) return 'Generale';
    if (NOMI_DOMINIO[d]) return NOMI_DOMINIO[d];
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  function quando(ms) {
    var d = ms - Date.now();
    if (d <= 0) return 'ora';
    var min = Math.round(d / 60000);
    if (min < 60) return 'tra ' + min + ' min';
    var ore = Math.round(min / 60);
    if (ore < 24) return 'tra ' + ore + ' h';
    var gg = Math.round(ore / 24);
    return 'tra ' + gg + (gg === 1 ? ' giorno' : ' giorni');
  }

  function plurale(n, sing, plur) { return n + ' ' + (n === 1 ? sing : plur); }

  return {
    init: init, esc: esc, html: html, grezzo: grezzo, rendi: rendi,
    su: su, uno: uno, brindisi: brindisi, foglio: foglio,
    icona: icona, lemmaPerId: lemmaPerId, nomeDominio: nomeDominio,
    quando: quando, plurale: plurale
  };
})();
