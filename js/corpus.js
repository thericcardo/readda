/* Readda - accesso al corpus.
 *
 * Dodicimila voci non stanno in un file solo: all'avvio si carica il manifesto
 * (un chilobyte) e i blocchi arrivano quando servono. Il blocco di un lemma si
 * calcola dal lemma stesso, quindi non c'e' nessun indice da scaricare e
 * aggiungere voci non sposta quelle gia' pubblicate.
 */
window.Readda = window.Readda || {};

Readda.Corpus = (function () {
  var voci = {};              // id -> voce, solo dei blocchi caricati
  var caricati = {};          // n -> true
  var inCorso = {};           // n -> [callback]
  var N = 64;

  function manifesto() { return window.READDA_MANIFESTO || { voci: 0, blocchi: N }; }
  function totale() { return manifesto().voci; }

  /* FNV-1a a 32 bit. Deve restare identica a blocco_di() in
   * strumenti/costruisci.py: se le due divergono, i lemmi non si trovano piu'. */
  function blocco(id) {
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % N;
  }

  /* Il file del blocco richiama questa funzione appena arriva. */
  window.READDA_BLOCCO = function (n, elenco) {
    for (var i = 0; i < elenco.length; i++) {
      var v = elenco[i];
      v.lemma = v.id;
      if (!v.sin) v.sin = [];
      if (!v.dom) v.dom = ['generale'];
      if (!v.es) v.es = '';
      voci[v.id] = v;
    }
    caricati[n] = true;
    var attesa = inCorso[n] || [];
    delete inCorso[n];
    for (var k = 0; k < attesa.length; k++) attesa[k]();
  };

  function carica(n, quandoPronto) {
    if (caricati[n]) { quandoPronto(); return; }
    if (inCorso[n]) { inCorso[n].push(quandoPronto); return; }
    inCorso[n] = [quandoPronto];
    var s = document.createElement('script');
    s.src = 'data/blocco-' + (n < 10 ? '0' + n : n) + '.js';
    s.async = true;
    s.onerror = function () {
      // un blocco mancante non deve bloccare l'app: si continua con il resto
      caricati[n] = true;
      var attesa = inCorso[n] || []; delete inCorso[n];
      for (var k = 0; k < attesa.length; k++) attesa[k]();
    };
    document.head.appendChild(s);
  }

  function caricaTanti(elencoN, quandoPronto) {
    var mancanti = [];
    for (var i = 0; i < elencoN.length; i++) {
      if (!caricati[elencoN[i]] && mancanti.indexOf(elencoN[i]) < 0) mancanti.push(elencoN[i]);
    }
    if (!mancanti.length) { quandoPronto(); return; }
    var restanti = mancanti.length;
    for (var j = 0; j < mancanti.length; j++) {
      carica(mancanti[j], function () { if (--restanti === 0) quandoPronto(); });
    }
  }

  /* Assicura che le voci con questi id siano in memoria. */
  function assicura(ids, quandoPronto) {
    var n = [];
    for (var i = 0; i < ids.length; i++) {
      var b = blocco(ids[i]);
      if (n.indexOf(b) < 0) n.push(b);
    }
    caricaTanti(n, quandoPronto);
  }

  /* Carica altri blocchi scelti a caso fra quelli non ancora presi.
   * I blocchi sono assegnati per hash, quindi ognuno e' un campione
   * rappresentativo del corpus: non serve sceglierli per dominio. */
  function allarga(quanti, quandoPronto) {
    var liberi = [];
    for (var n = 0; n < N; n++) if (!caricati[n]) liberi.push(n);
    if (!liberi.length) { quandoPronto(false); return; }
    var presi = [];
    for (var i = 0; i < quanti && liberi.length; i++) {
      presi.push(liberi.splice(Math.floor(Math.random() * liberi.length), 1)[0]);
    }
    caricaTanti(presi, function () { quandoPronto(true); });
  }

  function lemma(id) { return voci[id] || null; }
  function disponibili() {
    var fuori = [];
    for (var k in voci) if (voci.hasOwnProperty(k)) fuori.push(voci[k]);
    return fuori;
  }
  function quantiCaricati() {
    var n = 0;
    for (var k in caricati) if (caricati.hasOwnProperty(k) && caricati[k]) n++;
    return n;
  }

  return {
    blocco: blocco, carica: carica, assicura: assicura, allarga: allarga,
    lemma: lemma, disponibili: disponibili, totale: totale,
    manifesto: manifesto, quantiCaricati: quantiCaricati,
    nBlocchi: function () { return N; }
  };
})();
