#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Readda - il ciclo del corpus.

Un comando solo, da rieseguire quando si vuole: scarica il dump piu' recente
del Wikizionario italiano, ne estrae le voci, ricostruisce i blocchi e dice
cosa e' cambiato rispetto a prima.

    python3 strumenti/aggiorna.py                 # ciclo completo
    python3 strumenti/aggiorna.py --salta-scarico # riusa il dump gia' preso
    python3 strumenti/aggiorna.py --solo-report   # non tocca niente, confronta

Le voci gia' pubblicate non si spostano mai di blocco, perche' il blocco si
ricava dall'hash del lemma e il numero di blocchi e' fisso. Un aggiornamento
quindi aggiunge e corregge, non rimescola: chi ha l'app aperta scarica solo i
blocchi cambiati, non tutto il corpus.
"""
import argparse, json, os, subprocess, sys, time, urllib.request, shutil

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
DATI = os.path.join(RADICE, 'data')
LAVORO = os.path.join(RADICE, '.lavoro')

DUMP_URL = 'https://dumps.wikimedia.org/itwiktionary/latest/itwiktionary-latest-pages-articles.xml.bz2'
FREQ_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_full.txt'


def passo(n, testo):
    print('\n[%d] %s' % (n, testo), flush=True)


def scarica(url, dove, etichetta):
    if os.path.exists(dove):
        eta = (time.time() - os.path.getmtime(dove)) / 86400
        print('    %s gia\' presente (%.1f MB, %.1f giorni)' % (etichetta, os.path.getsize(dove) / 1048576, eta))
        return
    print('    scarico %s ...' % etichetta, flush=True)
    tmp = dove + '.parziale'
    with urllib.request.urlopen(url, timeout=900) as r, open(tmp, 'wb') as f:
        shutil.copyfileobj(r, f, 1 << 20)
    os.replace(tmp, dove)
    print('    %s: %.1f MB' % (etichetta, os.path.getsize(dove) / 1048576))


def lemmi_pubblicati():
    """I lemmi attualmente nei blocchi, letti senza eseguire JavaScript."""
    fuori = {}
    if not os.path.isdir(DATI): return fuori
    for nome in sorted(os.listdir(DATI)):
        if not nome.startswith('blocco-'): continue
        t = open(os.path.join(DATI, nome), encoding='utf-8').read()
        i = t.index('(', t.index('READDA_BLOCCO'))
        elenco = json.loads(t[i + 1:t.rindex(')')].split(',', 1)[1])
        for v in elenco:
            fuori[v['id']] = v.get('def', '')
    return fuori


def report(prima, dopo):
    nuovi = sorted(set(dopo) - set(prima))
    spariti = sorted(set(prima) - set(dopo))
    cambiati = sorted(k for k in set(prima) & set(dopo) if prima[k] != dopo[k])
    print('\n' + '=' * 58)
    print('  prima: %6d voci' % len(prima))
    print('  dopo : %6d voci   (%+d)' % (len(dopo), len(dopo) - len(prima)))
    print('  nuove: %6d' % len(nuovi))
    print('  tolte: %6d' % len(spariti))
    print('  definizioni aggiornate: %d' % len(cambiati))
    if nuovi:   print('\n  esempi di nuove : ' + ', '.join(nuovi[:12]))
    if spariti: print('  esempi di tolte : ' + ', '.join(spariti[:12]))
    print('=' * 58)
    return {'prima': len(prima), 'dopo': len(dopo), 'nuove': len(nuovi),
            'tolte': len(spariti), 'aggiornate': len(cambiati)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--salta-scarico', action='store_true', help='riusa dump e frequenze gia' ' scaricati')
    ap.add_argument('--solo-report', action='store_true', help='confronta senza riscrivere i blocchi')
    ap.add_argument('--obiettivo', type=int, default=0, help='massimo di voci automatiche (0 = tutte)')
    a = ap.parse_args()

    os.makedirs(LAVORO, exist_ok=True)
    dump = os.path.join(LAVORO, 'itwiktionary.xml.bz2')
    freq = os.path.join(LAVORO, 'frequenze.txt')
    grezzo = os.path.join(LAVORO, 'grezzo.json')

    prima = lemmi_pubblicati()
    print('corpus pubblicato: %d voci' % len(prima))

    if not a.salta_scarico:
        passo(1, 'Sorgenti')
        scarica(DUMP_URL, dump, 'dump del Wikizionario')
        scarica(FREQ_URL, freq, 'lista di frequenza')
    elif not (os.path.exists(dump) and os.path.exists(freq)):
        sys.exit('manca il materiale scaricato: esegui senza --salta-scarico')

    passo(2, 'Estrazione')
    subprocess.run([sys.executable, os.path.join(QUI, 'estrai.py'),
                    '--dump', dump, '--uscita', grezzo], check=True)

    if a.solo_report:
        passo(3, 'Solo confronto: i blocchi non vengono toccati')
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            sys.path.insert(0, QUI)
            import costruisci as C
            voci = C.costruisci(grezzo, freq, os.path.join(QUI, 'curati.js'), a.obiettivo)
            report(prima, {v['id']: v['def'] for v in voci})
        return

    passo(3, 'Costruzione dei blocchi')
    subprocess.run([sys.executable, os.path.join(QUI, 'costruisci.py'),
                    '--grezzo', grezzo, '--frequenze', freq,
                    '--curati', os.path.join(QUI, 'curati.js'),
                    '--obiettivo', str(a.obiettivo)], check=True)

    passo(4, 'Cosa e\' cambiato')
    numeri = report(prima, lemmi_pubblicati())

    storico = os.path.join(DATI, 'storico.json')
    righe = json.load(open(storico, encoding='utf-8')) if os.path.exists(storico) else []
    righe.append(dict(numeri, quando=time.strftime('%Y-%m-%d %H:%M')))
    json.dump(righe[-40:], open(storico, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print('\nOra: node test/prova.js  e  node test/e2e.js')


if __name__ == '__main__':
    main()
