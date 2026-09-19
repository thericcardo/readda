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
    var tutti = Readda.Corpus.disponibili();
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

  /* Coda del flusso.
   *
   * Gli interessi dichiarati sono un'inclinazione, non un filtro. Pesando e
   * ordinando soltanto, un profilo "medico" riceveva 450 parole mediche in un
   * mese e zero lessico generale: "scevro", "prevaricare", "zotico" non
   * arrivavano mai, pur essendo esattamente le parole per cui esiste l'app.
   *
   * Quindi ogni infornata si compone per strati, con quote fisse:
   *   22%  i temi di chi legge (lavoro e interessi)
   *   70%  lessico generale, che non appartiene a nessun dominio
   *    8%  tutto il resto, perche' incontrare l'imprevisto e' il punto
   *
   * Lo strato generale vale 3.419 voci: a queste quote si esaurisce in circa
   * undici mesi d'uso quotidiano, mentre gli altri basterebbero per anni.
   * Quando accade, la ridistribuzione qui sotto riempie il vuoto dagli altri
   * strati: il flusso non si ferma, si sbilancia verso i domini.
   */
  var QUOTE = { tema: 0.22, generale: 0.70, altro: 0.08 };

  /* "Generale" non vuol dire "senza dominio": vuol dire "non specialistico".
   * Emozioni, tempo, lingua, pensiero, natura, storia, societa' e scuola sono
   * categorie umane, non mestieri: "sussulto" e' etichettato emozioni e
   * "varcare" tempo, ma sono lessico che serve a chiunque. Le etichette
   * restano, e continuano a valere per lo strato dei temi: una parola puo'
   * essere insieme generale e in tema con chi legge.
   * Restano specialistici solo i mestieri veri: medicina, diritto, tecnologia,
   * scienza, lavoro. Cosi' lo strato generale passa da 3.419 a oltre 9.000
   * voci, mentre abbassare i filtri non lo portava oltre 4.500. */
  var LARGHI = ['generale', 'emozioni', 'tempo', 'lingua', 'pensiero',
                'natura', 'storia', 'politica', 'scuola', 'arte', 'cucina'];

  function coda(profilo, parole, quante, esplicito) {
    var interessi = profilo.interessi || [];
    var lavoro = profilo.lavoro;
    var tetto = ({ base: 1, medio: 2, alto: 3 })[profilo.obiettivo] || 3;
    quante = quante || 40;

    var strati = { tema: [], generale: [], altro: [] };

    Readda.Corpus.disponibili().forEach(function (l) {
      var p = parole[l.id];
      if (p && p.stato) return;                 // gia' giudicato: vive nel ripasso
      if (l.sens && !esplicito) return;         // esplicito: fuori dal flusso
      if (l.lvl > tetto + 1) return;

      var suo = l.dom.some(function (d) { return d === lavoro || interessi.indexOf(d) >= 0; });
      var generico = generale(l);
      var strato = suo ? 'tema' : (generico ? 'generale' : 'altro');

      // dentro lo strato conta la vicinanza al livello scelto, piu' un po' di
      // rumore: due aperture di seguito non devono dare lo stesso ordine
      var peso = 1;
      if (l.lvl === tetto) peso += 1.1;
      if (l.lvl > tetto) peso *= 0.45;
      if (l.es) peso += 0.5;                    // una carta con esempio vale di piu'

      // Chiave di Efraimidis-Spirakis: estrazione pesata senza rimpiazzo.
      // Ordinare per peso lo rifarebbe un filtro, com'e' gia' successo un
      // livello piu' su: con migliaia di candidati, chi ha peso 1 non entra
      // mai fra i primi se centinaia hanno peso 2,6. Cosi' invece un peso
      // doppio da' il doppio delle probabilita', non la certezza.
      strati[strato].push({ l: l, chiave: Math.pow(Math.random(), 1 / peso) });
    });

    var nomi = ['tema', 'generale', 'altro'];
    var perChiave = function (a, b) { return b.chiave - a.chiave; };
    nomi.forEach(function (n) { strati[n].sort(perChiave); });

    // si prende la quota da ogni strato; cio' che uno strato non riesce a
    // dare lo ridistribuiscono gli altri, cosi' la coda resta piena
    var presi = [], mancanti = 0;
    nomi.forEach(function (n) {
      var voluti = Math.round(quante * QUOTE[n]);
      var dati = strati[n].splice(0, voluti);
      mancanti += voluti - dati.length;
      presi = presi.concat(dati);
    });
    if (mancanti > 0) {
      var avanzi = strati.tema.concat(strati.generale, strati.altro);
      avanzi.sort(perChiave);
      presi = presi.concat(avanzi.slice(0, mancanti));
    }

    return mescola(presi).map(function (x) { return x.l; });
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
    var voce = Readda.Corpus.lemma(lemma);
    var out = [radice(lemma)];
    if (voce && voce.forme) {
      voce.forme.forEach(function (f) { out.push(normalizza(f)); });
    }
    return out;
  }

  function normalizza(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s']/g, ' ');
  }

  function contiene(frase, lemma) {
    var testo = normalizza(frase);
    return radici(lemma).some(function (r) {
      if (r.length < 3) return testo.indexOf(normalizza(lemma)) >= 0;
      return new RegExp('\\b' + r).test(testo);
    });
  }

  /* Esposto perche' i test misurino la stessa definizione che usa la coda:
     duplicarla altrove le fa divergere in silenzio. */
  function generale(l) {
    return l.dom.every(function (d) { return LARGHI.indexOf(d) >= 0; });
  }

  return {
    intervallo: intervallo, scadenze: scadenze, distrattori: distrattori,
    generale: generale, larghi: function () { return LARGHI.slice(); },
    coda: coda, contiene: contiene, radice: radice, radici: radici, mescola: mescola
  };
})();
