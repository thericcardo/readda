/* Readda - decide chi va svegliato e con che parole.
 * Separato dal server perche' e' la parte con le regole, e va collaudata
 * senza aprire porte ne' mandare niente a nessuno.
 */
'use strict';

const ORE = 3600e3;
const DISTANZA_MINIMA = 6 * ORE;    // non piu' di un promemoria ogni sei ore
const FINESTRA_INIZIO = 9;          // niente notifiche prima delle 9
const FINESTRA_FINE = 21;           // ne' dopo le 21, ora locale di chi legge
const RITARDO_MASSIMO = 3 * 24 * ORE;  // oltre tre giorni, la scadenza e' stantia

function oraLocale(adesso, fuso) {
  // fuso e' lo scostamento in minuti che manda il browser (getTimezoneOffset
  // invertito): senza, si presume l'ora del server
  const ms = adesso + (typeof fuso === 'number' ? fuso * 60e3 : 0);
  return new Date(ms).getUTCHours();
}

function dentroLaFinestra(adesso, fuso) {
  const h = oraLocale(adesso, fuso);
  return h >= FINESTRA_INIZIO && h < FINESTRA_FINE;
}

/* Restituisce il messaggio da mandare, oppure null se non e' il momento. */
function daSvegliare(utente, adesso) {
  adesso = adesso || Date.now();
  if (!utente || !utente.iscrizione || !utente.scadenze) return null;
  if (utente.ultimoInvio && adesso - utente.ultimoInvio < DISTANZA_MINIMA) return null;
  if (!dentroLaFinestra(adesso, utente.fuso)) return null;

  const mature = utente.scadenze.filter(
    (s) => s.quando <= adesso && adesso - s.quando < RITARDO_MASSIMO);
  if (!mature.length) return null;

  // la produzione vale piu' del riconoscimento: e' li' che si guadagna
  mature.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'produzione' ? -1 : 1;
    return a.quando - b.quando;
  });
  const prima = mature[0];
  const altre = mature.length - 1;

  if (prima.tipo === 'produzione') {
    return {
      titolo: 'L’hai usata, «' + prima.lemma + '»?',
      corpo: 'Scrivi una frase vera in cui l’hai detta o scritta. ' +
             'Se non è successo va bene: si riprova.',
      rotta: '#/ripasso',
      lemma: prima.lemma,
    };
  }
  return {
    titolo: altre > 0
      ? (mature.length + ' parole aspettano')
      : '«' + prima.lemma + '» aspetta',
    corpo: 'Due minuti bastano per non perderle.',
    rotta: '#/ripasso',
    lemma: prima.lemma,
  };
}

/* Voci da ripulire: gia' passate da troppo tempo, non torneranno utili. */
function potaScadenze(scadenze, adesso) {
  adesso = adesso || Date.now();
  return (scadenze || []).filter((s) => adesso - s.quando < RITARDO_MASSIMO);
}

module.exports = {
  daSvegliare, potaScadenze, dentroLaFinestra, oraLocale,
  DISTANZA_MINIMA, FINESTRA_INIZIO, FINESTRA_FINE, RITARDO_MASSIMO,
};
