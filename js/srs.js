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
   * preferendo quelli dello stesso dominio perché la scelta sia difficile.
   *
   * Si scartano per testo, non per identificatore. Nel corpus 38 definizioni
   * compaiono su due voci diverse — «Che non si può cancellare» sta sia su
   * "incancellabile" sia su "indelebile" — e un identificatore diverso non
   * basta a garantire una risposta diversa: la stessa frase poteva comparire
   * due volte, una segnata giusta e una sbagliata. */
  function distrattori(lemma, quanti) {
    // senza prototipo: una definizione che si chiamasse "constructor"
    // risulterebbe gia' vista su un oggetto normale
    var visti = Object.create(null);
    visti[lemma.def] = true;
    var vicini = [], lontani = [];
    Readda.Corpus.disponibili().forEach(function (l) {
      if (l.id === lemma.id || visti[l.def]) return;
      visti[l.def] = true;
      var stessoDominio = l.dom.some(function (d) { return lemma.dom.indexOf(d) >= 0; });
      (stessoDominio ? vicini : lontani).push(l.def);
    });
    return mescola(vicini).concat(mescola(lontani)).slice(0, quanti);
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
   *
   * Il controllo della frase e' l'unico punto in cui chi usa l'app produce
   * qualcosa: sbagliarlo vuol dire dire "hai sbagliato" a chi ha ragione.
   * I verbi regolari si riconoscono dalla radice ricavata dall'infinito. Gli
   * irregolari no: "imposto" non contiene "imporr", e la frase "gli hanno
   * imposto il silenzio" veniva respinta con "Manca la parola".
   *
   * Dichiararli uno per uno nel corpus non basta: il campo `forme` esiste su
   * 5 voci delle 13.589, contro 2.572 verbi. Ma gli irregolari italiani non
   * sono nemmeno casi isolati - sono classi chiuse e produttive. Tutti i
   * composti di "porre" si comportano come "porre", tutti quelli di "durre"
   * come "durre". Le famiglie qui sotto coprono quelle classi; il campo
   * `forme` resta per i casi che nessuna classe descrive. */
  var VERBO = /(arsi|ersi|irsi|are|ere|ire)$/;

  /* [fine dell'infinito, temi che la sostituiscono].
   * Le finali piu' lunghe vengono prima: "scrivere" prima di "vere",
   * "ndere" prima delle altre in -dere. */
  var FAMIGLIE = [
    ['scrivere', ['scritt', 'scriv', 'scriss']],   // descrivere -> descritto
    ['mettere',  ['mess', 'mett', 'mis']],         // ammettere  -> ammesso, ammisi
    ['rompere',  ['rott', 'romp', 'rupp']],        // interrompere -> interrotto
    ['gliere',   ['lt', 'lg', 'ls', 'gli']],       // scegliere  -> scelto, scelgo
    // "tra" da solo prenderebbe l'intero prefisso contra-: 36 lemmi del
    // corpus, da "contraccezione" a "contrafforte". Le forme che servono
    // davvero si scrivono per intero.
    ['trarre',   ['tratt', 'tragg', 'trass', 'trae', 'trai', 'traev', 'traen']],
    ['primere',  ['press', 'prim']],               // esprimere  -> espresso
    ['iedere',   ['iest', 'ied']],                 // richiedere -> richiesto
    ['cedere',   ['cess', 'ced']],                 // concedere  -> concesso
    ['vedere',   ['vist', 'ved', 'vid']],          // prevedere  -> previsto
    ['sedere',   ['sed', 'sied']],                 // possedere  -> possiede
    ['tenere',   ['ten', 'tien', 'tenn']],         // ottenere   -> ottiene
    ['venire',   ['ven', 'vien', 'venn']],         // provenire  -> proviene
    ['uscire',   ['usc', 'esc']],                  // riuscire   -> riesce
    ['scere',    ['sciut', 'sc']],                 // conoscere  -> conosciuto
    ['ndere',    ['s', 'nd']],                     // difendere  -> difeso
    ['udere',    ['us', 'ud']],                    // eludere    -> eluso
    ['idere',    ['is', 'id']],                    // decidere   -> deciso
    ['adere',    ['as', 'ad']],                    // persuadere -> persuaso
    ['ngere',    ['nt', 'ng']],                    // spingere   -> spinto
    ['ncere',    ['nt', 'nc']],                    // convincere -> convinto
    ['lgere',    ['lt', 'lg']],                    // rivolgere  -> rivolto
    ['rgere',    ['rs', 'rg']],                    // emergere   -> emerso
    ['ggere',    ['tt', 'gg']],                    // proteggere -> protetto
    ['lvere',    ['lt', 'lv']],                    // risolvere  -> risolto
    ['rrere',    ['rs', 'rr']],                    // incorrere  -> incorso
    ['durre',    ['dott', 'duc', 'duss', 'durr']], // produrre   -> prodotto
    ['porre',    ['pos', 'pon', 'porr']],          // imporre    -> imposto
    ['fare',     ['fatt', 'facc', 'fec', 'f']],    // soddisfare -> soddisfatto
    // non solo verbi: i nomi in -cia e -gia cambiano la sillaba finale al
    // plurale ("figuraccia" -> "figuracce"), e togliere la sola vocale non
    // basta. Stanno in fondo perche' una finale verbale vince sempre.
    ['cia',      ['c']],
    ['gia',      ['g']]
  ];

  /* Un tema corto corrisponde a mezza lingua: "pos" da "porre" varrebbe per
   * "posto", "possibile", "posizione". Sotto i quattro caratteri non si usa,
   * e quindi i verbi base ("porre", "trarre") restano affidati alla radice
   * normale: le famiglie servono ai composti, che sono la quasi totalita'. */
  var MIN_TEMA = 4;

  /* Un riflessivo si flette come l'infinito da cui viene, e l'infinito si
   * ricava togliendo "si" e rimettendo la finale. Due possibilita', perche'
   * i verbi in -rre perdono una erre davanti al pronome: "esimersi" viene da
   * "esimere", ma "opporsi" viene da "opporre" e "ritrarsi" da "ritrarre". */
  function infiniti(lemma) {
    var l = normalizza(lemma).trim();
    if (l.length > 3 && l.slice(-2) === 'si') {
      var base = l.slice(0, -2);
      return [base + 're', base + 'e', l];
    }
    return [l];
  }

  function derivate(lemma) {
    var candidati = infiniti(lemma);
    for (var c = 0; c < candidati.length; c++) {
      var l = candidati[c];
      for (var i = 0; i < FAMIGLIE.length; i++) {
        var fine = FAMIGLIE[i][0];
        if (l.length <= fine.length || l.slice(-fine.length) !== fine) continue;
        var base = l.slice(0, l.length - fine.length);
        var fuori = [];
        for (var k = 0; k < FAMIGLIE[i][1].length; k++) {
          var tema = base + FAMIGLIE[i][1][k];
          if (tema.length >= MIN_TEMA) fuori.push(tema);
        }
        if (fuori.length) return fuori;
      }
    }
    return [];
  }

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
    var out = [radice(lemma)].concat(derivate(lemma));
    if (voce && voce.forme) {
      voce.forme.forEach(function (f) { out.push(normalizza(f)); });
    }
    return out.filter(function (r, i) { return r && out.indexOf(r) === i; });
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
    coda: coda, contiene: contiene, radice: radice, radici: radici,
    derivate: derivate, famiglie: function () { return FAMIGLIE.slice(); },
    mescola: mescola
  };
})();
