#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Readda - riallinea i blocchi pubblicati a quello che la pipeline produce oggi.

La pipeline e' stata corretta piu' volte senza che i dati venissero
rigenerati: `data/` porta ancora i difetti che `estrai.py` non commette piu'.
Rigenerare dal dump non e' la risposta - un milione di pagine riscritte
cambierebbe migliaia di voci in un colpo solo, e nessuna prova saprebbe dire
se il risultato e' migliore. Questo strumento fa l'opposto: applica alle sole
voci difettose le stesse funzioni che la pipeline usa oggi, e lascia
intoccato tutto il resto.

Ogni riparazione e' riconoscibile da una condizione verificabile, non da un
elenco di lemmi scritto a mano: cosi' lo strumento resta utile anche la
prossima volta.

    python3 strumenti/ripara.py --controlla   # dice cosa cambierebbe, non tocca
    python3 strumenti/ripara.py               # ripara e riscrive i blocchi

`--controlla` esce con codice 1 se c'e' qualcosa da riparare: e' il modo in
cui `test/dati.js` e la pipeline possono accorgersene da sole.
"""
import argparse, json, os, re, sys

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
DATI = os.path.join(RADICE, 'data')
sys.path.insert(0, QUI)

import estrai            # pulisci, chiudi_taglio
import costruisci        # tipografia, N_BLOCCHI, blocco_di

# I due tetti che estrai.py applica a definizioni ed esempi. Una voce lunga
# esattamente tetto+1 e' stata tagliata al carattere numero `tetto` e poi
# chiusa con il punto da tipografia(): quel punto traveste un monco da frase
# intera. Lunghezze inferiori non possono venire dal taglio, perche' fra il
# taglio e la scrittura si perde al massimo uno spazio.
TETTO_DEF = 260
TETTO_ES = 200

MARKUP = re.compile(r'\[\[|\]\]|\{\{|\}\}|\[|\]|<[a-z/]|\'\'')

# ":-)" contiene una tonda che non chiude niente: bilanciare le parentesi
# dentro una faccina la distrugge. Il caso esiste davvero, alla voce "faccina".
FACCINA = re.compile(r'[:;=]-?[()]')


def bilancia_parentesi(t):
    """Rimette in pari le tonde senza perdere testo.

    Le due meta' del problema non si riparano allo stesso modo. Una chiusa
    che non apre niente e' spazzatura: si toglie, e non si perde nulla
    ("(di bestie)) fare a pezzi"). Un'aperta che non chiude, invece, ha del
    testo dentro: cancellarla butterebbe via l'inciso di "ferragosto"
    ("Giorno festivo (15 agosto, ... al Cielo"), quindi si chiude in fondo.
    """
    if FACCINA.search(t):
        return t
    fuori, aperte = [], 0
    for c in t:
        if c == '(':
            aperte += 1; fuori.append(c)
        elif c == ')':
            if aperte:
                aperte -= 1; fuori.append(c)
            # una chiusa senza apertura non si copia
        else:
            fuori.append(c)
    testo = ''.join(fuori).rstrip()
    coda = ''
    while testo and testo[-1] in '.!?\u2026':
        coda = testo[-1] + coda
        testo = testo[:-1].rstrip()
    testo += ')' * aperte + coda
    testo = re.sub(r'\s+', ' ', testo)
    return re.sub(r'\s+([.,;:!?)])', r'\1', testo).strip()


def squilibrata(t):
    return not FACCINA.search(t) and t.count('(') != t.count(')')


def sospetta(v):
    """Testi lunghi esattamente quanto il tetto: il taglio puo' esserci
    stato, ma il testo finisce comunque con un punto suo, quindi si legge.
    Non si toccano - ripararli alla cieca accorcerebbe anche le definizioni
    che quella lunghezza ce l'hanno per davvero - ma si contano."""
    return sum(1 for campo, tetto in (('def', TETTO_DEF), ('es', TETTO_ES))
               if v.get(campo) and len(v[campo]) == tetto)


SPAZIO_PRIMA = re.compile(r'\s+([.,;:!?])')


def una_passata(v, fatte):
    """Una passata di riparazioni su una voce. Restituisce True se ha
    cambiato qualcosa: una riparazione puo' abilitarne un'altra - chiudere
    una parentesi allunga il testo, e il testo allungato puo' rivelarsi
    tagliato - quindi si ripassa finche' non si assesta."""
    mosso = False
    for campo, tetto in (('def', TETTO_DEF), ('es', TETTO_ES)):
        t = v.get(campo)
        if not t:
            continue

        def applica(etichetta, nuovo):
            nonlocal t, mosso
            nuovo = costruisci.tipografia(nuovo)
            if nuovo != t:
                v[campo] = t = nuovo
                fatte.append(campo + ':' + etichetta)
                mosso = True

        if MARKUP.search(t):
            applica('markup', estrai.pulisci(t))
        # il punto finale lo ha aggiunto tipografia(): sotto c'e' il taglio
        if len(t) == tetto + 1 and t.endswith('.'):
            applica('taglio', estrai.chiudi_taglio(t[:-1]))
        if squilibrata(t):
            applica('parentesi', bilancia_parentesi(t))
        if SPAZIO_PRIMA.search(t):
            applica('spazi', SPAZIO_PRIMA.sub(r'\1', t))
    return mosso


def ripara_voce(v, passate=4):
    """Restituisce l'elenco delle riparazioni applicate, modificando v."""
    fatte = []
    for _ in range(passate):
        if not una_passata(v, fatte):
            break
    return fatte


# ------------------------------------------------------------------ blocchi
INTESTAZIONE = ('/* Readda - blocco %02d di %d, %d voci.\n'
                '   Generato da strumenti/costruisci.py: non modificare a mano.\n'
                '   Fonte: Wikizionario italiano, CC BY-SA 3.0. */\n')


def leggi_blocco(n):
    percorso = os.path.join(DATI, 'blocco-%02d.js' % n)
    testo = open(percorso, encoding='utf-8').read()
    i = testo.index('(', testo.index('READDA_BLOCCO'))
    return json.loads(testo[i + 1:testo.rindex(')')].split(',', 1)[1])


def scrivi_blocco(n, voci):
    percorso = os.path.join(DATI, 'blocco-%02d.js' % n)
    with open(percorso, 'w', encoding='utf-8') as f:
        f.write(INTESTAZIONE % (n, costruisci.N_BLOCCHI, len(voci)))
        f.write('window.READDA_BLOCCO(%d,' % n)
        json.dump(voci, f, ensure_ascii=False, separators=(',', ':'))
        f.write(');\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--controlla', action='store_true',
                    help='elenca cosa cambierebbe senza scrivere; esce 1 se c\'e\' da riparare')
    ap.add_argument('--verboso', action='store_true', help='stampa ogni voce riparata')
    a = ap.parse_args()

    conteggi, esempi, toccati, sospette = {}, [], 0, 0
    for n in range(costruisci.N_BLOCCHI):
        voci = leggi_blocco(n)
        cambiato = False
        for v in voci:
            prima = dict(v)
            sospette += sospetta(v)
            for nome in ripara_voce(v):
                conteggi[nome] = conteggi.get(nome, 0) + 1
                cambiato = True
                campo = nome.split(':')[0]
                if a.verboso or len(esempi) < 8:
                    esempi.append((v['id'], nome, prima.get(campo, ''), v.get(campo, '')))
        if cambiato:
            toccati += 1
            if not a.controlla:
                scrivi_blocco(n, voci)

    if sospette:
        print('%d testi lunghi esattamente quanto il tetto: forse tagliati, '
              'ma finiscono con un punto. Lasciati come sono.\n' % sospette)

    if not conteggi:
        print('i blocchi pubblicati sono gia\' allineati alla pipeline')
        return 0

    for id_voce, nome, prima, dopo in esempi:
        print('  %-18s %-14s %s\n  %-18s %-14s %s\n'
              % (id_voce, nome, json.dumps(prima, ensure_ascii=False)[:150],
                 '', '', json.dumps(dopo, ensure_ascii=False)[:150]))
    print('riparazioni: %s' % ', '.join('%s %d' % kv for kv in sorted(conteggi.items())))
    print('blocchi coinvolti: %d su %d' % (toccati, costruisci.N_BLOCCHI))
    if a.controlla:
        print('\n(nessun file scritto: esegui senza --controlla per applicare)')
        return 1
    print('blocchi riscritti.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
