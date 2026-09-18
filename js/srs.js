/* Readda — ripetizione dilazionata (Leitner a 6 caselle) e selezione del flusso. */
window.Readda = window.Readda || {};

Readda.Srs = (function () {
  var MIN = 60000, GIORNO = 864e5;
  // box 0 = appena vista, box 5 = consolidata
  var INTERVALLI = [10 * MIN, 1 * GIORNO, 3 * GIORNO, 7 * GIORNO, 16 * GIORNO, 35 * GIORNO];

  function intervallo(box) { return INTERVALLI[Math.min(Math.max(box, 0), 5)]; }

  /* Elementi da ripassare adesso, ordinati per urgenza.
   * Tipo 'produzione' = scrivi una frase (parole passive e bluff).
   * Tipo 'riconoscimento' = scegli la definizione (parole ignote). */
  function scadenze(parole) {
    var ora = Date.now(), fuori = [];
    for (var id in parole) {
      if (!parole.hasOwnProperty(id)) continue;
      var p = parole[id];
      if (!p.prox || p.prox > ora) continue;
      var tipo;
      if (p.stato === 'passiva' || p.bluff) tipo = 'produzione';
      else if (p.stato === 'ignota') tipo = 'riconoscimento';
      else continue;
      fuori.push({ id: id, tipo: tipo, ritardo: ora - p.prox, box: p.box });
    }
    fuori.sort(function (a, b) { return b.ritardo - a.ritardo; });
    return fuori;
  }

  /* Distrattori per il test a scelta multipla: definizioni di altri lemmi,
   * preferendo quelli dello stesso dominio perché la scelta sia difficile. */
  function distrattori(lemma, quanti) {
    var tutti = window.READDA_LEMMI;
    var stessoDominio = tutti.filter(function (l) {
      return l.id !== lemma.id && l.dom.some(function (d) { return lemma.dom.indexOf(d) >= 0; });
    });
    var altri = tutti.filter(function (l) { return l.id !== lemma.id && stessoDominio.indexOf(l) < 0; });
    var pozzo = mescola(stessoDominio).concat(mescola(altri));
    return pozzo.slice(0, quanti).map(function (l) { return l.def; });
  }

  function mescola(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Coda del flusso: pesa i lemmi su interessi, lavoro e livello dichiarato,
   * escludendo quelli già giudicati. */
  function coda(profilo, parole, quante) {
    var interessi = profilo.interessi || [];
    var lavoro = profilo.lavoro;
    var tetto = ({ base: 1, medio: 2, alto: 3 })[profilo.obiettivo] || 3;

    var candidati = window.READDA_LEMMI.filter(function (l) {
      var p = parole[l.id];
      if (p && p.stato === 'attiva') return false;
      if (p && p.stato) return false;          // già giudicato: vive nel ripasso
      return l.lvl <= tetto + 1;
    });

    var pesati = candidati.map(function (l) {
      var peso = 1;
      l.dom.forEach(function (d) {
        if (interessi.indexOf(d) >= 0) peso += 2.2;
        if (d === lavoro) peso += 3;
      });
      if (l.lvl === tetto) peso += 1.1;        // la zona di crescita è al confine
      if (l.lvl > tetto) peso *= 0.45;
      return { l: l, peso: peso * (0.55 + Math.random()) };
    });

    pesati.sort(function (a, b) { return b.peso - a.peso; });
    return pesati.slice(0, quante || 40).map(function (x) { return x.l; });
  }

  /* Verifica che una frase contenga davvero la parola, tollerando la flessione.
   * I verbi regolari si riconoscono dalla radice; i participi irregolari
   * (eludere -> eluso) hanno bisogno di radici alternative dichiarate nel corpus,
   * perche' nessuna regola meccanica li ricava dall'infinito. */
  var VERBO = /(arsi|ersi|irsi|are|ere|ire)$/;

  function radice(lemma) {
    var l = normalizza(lemma);
    if (l.length <= 4) return l;
    if (VERBO.test(l)) {
      var tema = l.replace(VERBO, '');
      return tema.length >= 4 ? tema : l.slice(0, 4);
    }
    // nomi e aggettivi: in italiano flettono solo la vocale finale
    return l.slice(0, l.length - 1);
  }

  function radici(lemma) {
    var voce = null, tutti = window.READDA_LEMMI || [];
    for (var i = 0; i < tutti.length; i++) {
      if (tutti[i].lemma === lemma || tutti[i].id === lemma) { voce = tutti[i]; break; }
    }
    var out = [radice(lemma)];
    if (voce && voce.forme) {
      voce.forme.forEach(function (f) { out.push(normalizza(f)); });
    }
    return out;
  }

  function normalizza(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s']/g, ' ');
  }

  function contiene(frase, lemma) {
    var testo = normalizza(frase);
    return radici(lemma).some(function (r) {
      if (r.length < 3) return testo.indexOf(normalizza(lemma)) >= 0;
      return new RegExp('\\b' + r).test(testo);
    });
  }

  return {
    intervallo: intervallo, scadenze: scadenze, distrattori: distrattori,
    coda: coda, contiene: contiene, radice: radice, radici: radici, mescola: mescola
  };
})();
