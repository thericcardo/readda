# -*- coding: utf-8 -*-
"""Readda - famiglie irregolari dell'italiano.

Gemella di `derivate()` in js/srs.js, e per la stessa ragione per cui esiste
quella: la radice ricavata meccanicamente dall'infinito non regge gli
irregolari, e "imposto" non contiene "imporr".

Serve in due punti diversi della stessa catena. Nell'app decide se la frase
scritta da chi studia contiene davvero la parola; qui in pipeline decide se
un esempio del Wikizionario illustra davvero il lemma a cui e' attaccato -
"Il soldato ritrasse la pistola" veniva scartato da "ritrarre" e la carta
restava senza esempio.

Le due implementazioni devono dare gli stessi temi: se divergono, l'app
accetta frasi che la pipeline avrebbe scartato e viceversa, in silenzio.
`test/dati.js` le confronta su tutti i lemmi del corpus, ed e' per quello
che questo file si puo' eseguire da solo:

    echo '["imporre","ritrarre"]' | python3 strumenti/flessione.py
"""
import json
import re
import sys
import unicodedata

# [fine dell'infinito, temi che la sostituiscono].
# Le finali piu' lunghe vengono prima: "scrivere" prima di "vere",
# "ndere" prima delle altre in -dere.
FAMIGLIE = [
    ('scrivere', ['scritt', 'scriv', 'scriss']),    # descrivere -> descritto
    ('mettere',  ['mess', 'mett', 'mis']),          # ammettere  -> ammesso, ammisi
    ('rompere',  ['rott', 'romp', 'rupp']),         # interrompere -> interrotto
    ('gliere',   ['lt', 'lg', 'ls', 'gli']),        # scegliere  -> scelto, scelgo
    # "tra" da solo prenderebbe l'intero prefisso contra-: 36 lemmi del
    # corpus, da "contraccezione" a "contrafforte". Le forme che servono
    # davvero si scrivono per intero.
    ('trarre',   ['tratt', 'tragg', 'trass', 'trae', 'trai', 'traev', 'traen']),
    ('primere',  ['press', 'prim']),                # esprimere  -> espresso
    ('iedere',   ['iest', 'ied']),                  # richiedere -> richiesto
    ('cedere',   ['cess', 'ced']),                  # concedere  -> concesso
    ('vedere',   ['vist', 'ved', 'vid']),           # prevedere  -> previsto
    ('sedere',   ['sed', 'sied']),                  # possedere  -> possiede
    ('tenere',   ['ten', 'tien', 'tenn']),          # ottenere   -> ottiene
    ('venire',   ['ven', 'vien', 'venn']),          # provenire  -> proviene
    ('uscire',   ['usc', 'esc']),                   # riuscire   -> riesce
    ('scere',    ['sciut', 'sc']),                  # conoscere  -> conosciuto
    ('ndere',    ['s', 'nd']),                      # difendere  -> difeso
    ('udere',    ['us', 'ud']),                     # eludere    -> eluso
    ('idere',    ['is', 'id']),                     # decidere   -> deciso
    ('adere',    ['as', 'ad']),                     # persuadere -> persuaso
    ('ngere',    ['nt', 'ng']),                     # spingere   -> spinto
    ('ncere',    ['nt', 'nc']),                     # convincere -> convinto
    ('lgere',    ['lt', 'lg']),                     # rivolgere  -> rivolto
    ('rgere',    ['rs', 'rg']),                     # emergere   -> emerso
    ('ggere',    ['tt', 'gg']),                     # proteggere -> protetto
    ('lvere',    ['lt', 'lv']),                     # risolvere  -> risolto
    ('rrere',    ['rs', 'rr']),                     # incorrere  -> incorso
    ('durre',    ['dott', 'duc', 'duss', 'durr']),  # produrre   -> prodotto
    ('porre',    ['pos', 'pon', 'porr']),           # imporre    -> imposto
    ('fare',     ['fatt', 'facc', 'fec', 'f']),     # soddisfare -> soddisfatto
    # non solo verbi: i nomi in -cia e -gia cambiano la sillaba finale al
    # plurale ("figuraccia" -> "figuracce"), e togliere la sola vocale non
    # basta. Stanno in fondo perche' una finale verbale vince sempre.
    ('cia',      ['c']),
    ('gia',      ['g']),
]

# Un tema corto corrisponde a mezza lingua: "pos" da "porre" varrebbe per
# "posto", "possibile", "posizione". Sotto i quattro caratteri non si usa, e
# quindi i verbi base ("porre", "trarre") restano affidati alla radice
# normale: le famiglie servono ai composti, che sono la quasi totalita'.
MIN_TEMA = 4


def normalizza(s):
    """Stessa normalizzazione di js/srs.js: minuscolo, accenti via, e via
    tutto cio' che non e' lettera, cifra, spazio o apostrofo."""
    s = (s or '').lower()
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9\s']", ' ', s)


def infiniti(lemma):
    """Un riflessivo si flette come l'infinito da cui viene, e l'infinito si
    ricava togliendo "si" e rimettendo la finale. Due possibilita', perche' i
    verbi in -rre perdono una erre davanti al pronome: "esimersi" viene da
    "esimere", ma "opporsi" viene da "opporre" e "ritrarsi" da "ritrarre"."""
    l = normalizza(lemma).strip()
    if len(l) > 3 and l[-2:] == 'si':
        base = l[:-2]
        return [base + 're', base + 'e', l]
    return [l]


def derivate(lemma):
    for l in infiniti(lemma):
        for fine, temi in FAMIGLIE:
            if len(l) <= len(fine) or not l.endswith(fine):
                continue
            base = l[:len(l) - len(fine)]
            fuori = [base + t for t in temi if len(base + t) >= MIN_TEMA]
            if fuori:
                return fuori
    return []


if __name__ == '__main__':
    lemmi = json.load(sys.stdin)
    json.dump({l: derivate(l) for l in lemmi}, sys.stdout, ensure_ascii=False)
