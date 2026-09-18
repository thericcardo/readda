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

module.exports = { ctx, carica };
