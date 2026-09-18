/* Banco di prova: esegue i file del browser in un contesto dove window === global,
 * così window.X crea davvero la variabile globale X, come in un browser. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const radice = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Math, Date, JSON, RegExp, Object, Array, String, Number, Boolean, Error, parseInt, parseFloat, isNaN, setTimeout, clearTimeout });
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.btoa = s => Buffer.from(s, 'binary').toString('base64');
ctx.atob = s => Buffer.from(s, 'base64').toString('binary');
ctx.escape = global.escape; ctx.unescape = global.unescape;
ctx.encodeURIComponent = encodeURIComponent; ctx.decodeURIComponent = decodeURIComponent;
ctx.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

function carica(rel) {
  vm.runInContext(fs.readFileSync(path.join(radice, rel), 'utf8'), ctx, { filename: rel });
}

/* Finto DOM quanto basta al caricatore dei blocchi: appendChild di uno script
 * esegue davvero il file, che a sua volta chiama window.READDA_BLOCCO. */
ctx.document = {
  head: {
    appendChild(s) {
      const f = path.join(radice, s.src);
      if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: s.src });
      else if (s.onerror) s.onerror();
    }
  },
  createElement: () => ({ src: '', async: false, onerror: null })
};

/* Carica manifesto, caricatore e i primi n blocchi del corpus. */
function caricaCorpus(nBlocchi) {
  carica('data/manifesto.js');
  carica('js/corpus.js');
  for (let n = 0; n < (nBlocchi === undefined ? 6 : nBlocchi); n++) {
    carica('data/blocco-' + String(n).padStart(2, '0') + '.js');
  }
  return ctx.Readda.Corpus;
}

module.exports = { ctx, carica, caricaCorpus };
