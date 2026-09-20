/* Readda - archivio del server: un file JSON, nessun database.
 * A questa scala (migliaia di iscritti) un file scritto in modo atomico
 * basta e avanza, e si puo' leggere con un editor quando qualcosa non torna.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function Archivio(percorso) {
  this.percorso = percorso;
  this.dati = { utenti: {} };
  this.daScrivere = false;
  this.carica();
  // scrittura differita: molte iscrizioni di fila non devono toccare il disco
  // ogni volta, ma nulla puo' restare in memoria piu' di due secondi
  this.timer = setInterval(() => this.salvaSeSporco(), 2000);
  if (this.timer.unref) this.timer.unref();
}

Archivio.prototype.carica = function () {
  try {
    this.dati = JSON.parse(fs.readFileSync(this.percorso, 'utf8'));
    if (!this.dati.utenti) this.dati.utenti = {};
  } catch (e) {
    this.dati = { utenti: {} };
  }
};

Archivio.prototype.salvaSeSporco = function () {
  if (!this.daScrivere) return;
  this.daScrivere = false;
  const tmp = this.percorso + '.tmp';
  fs.mkdirSync(path.dirname(this.percorso), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(this.dati));
  fs.renameSync(tmp, this.percorso);          // atomico: mai un file mezzo scritto
};

Archivio.prototype.sporca = function () { this.daScrivere = true; };

Archivio.prototype.utente = function (nick) {
  return this.dati.utenti[String(nick).toLowerCase()] || null;
};

Archivio.prototype.iscrivi = function (nick, iscrizione) {
  const chiave = String(nick).toLowerCase();
  const esistente = this.dati.utenti[chiave];
  const u = esistente || {
    nick: nick,
    // senza password, il gettone e' l'unica cosa che impedisce a chiunque
    // di sovrascrivere le scadenze altrui indovinando un nickname
    gettone: crypto.randomBytes(24).toString('base64url'),
    creato: Date.now(),
  };
  u.iscrizione = iscrizione;
  u.scadenze = u.scadenze || [];
  u.aggiornato = Date.now();
  this.dati.utenti[chiave] = u;
  this.sporca();
  return u;
};

Archivio.prototype.aggiornaScadenze = function (nick, scadenze) {
  const u = this.utente(nick);
  if (!u) return false;
  u.scadenze = scadenze;
  u.aggiornato = Date.now();
  this.sporca();
  return true;
};

Archivio.prototype.dimentica = function (nick) {
  delete this.dati.utenti[String(nick).toLowerCase()];
  this.sporca();
};

Archivio.prototype.tutti = function () {
  return Object.keys(this.dati.utenti).map((k) => this.dati.utenti[k]);
};

Archivio.prototype.chiudi = function () {
  clearInterval(this.timer);
  this.salvaSeSporco();
};

module.exports = Archivio;
