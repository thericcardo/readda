#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Readda - genera la pagina per l'artefatto da index.html.

La piattaforma degli artefatti avvolge la pagina in uno scheletro proprio, con
doctype, head e body: qui va consegnato solo il contenuto, piu' titolo e stili
in cima. Rigenerare invece di mantenere due copie a mano evita che divergano.

    python3 strumenti/artefatto.py
"""
import os

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TESTA = '''<title>Readda</title>
<meta name="theme-color" content="#202B22">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="assets/styles.css">
<style>
  /* Readda si impegna a un unico mondo visivo - verde oliva e oro - quindi
     non segue il tema di chi guarda: dipinge fondo e colori per intero. */
  :root{ color-scheme: dark; }
  html, body { height: 100%; background: #151C17; }
</style>

'''

def main():
    src = open(os.path.join(RADICE, 'index.html'), encoding='utf-8').read()
    corpo = src[src.index('<div class="grana"'):src.index('</body>')].strip()
    # il service worker non ha senso dentro un artefatto: lo cacherebbe
    corpo = corpo.replace('<script src="data/manifesto.js"></script>',
                          '<script src="data/manifesto.js"></script>')
    fuori = os.path.join(RADICE, 'artefatto', 'readda.html')
    os.makedirs(os.path.dirname(fuori), exist_ok=True)
    open(fuori, 'w', encoding='utf-8').write(TESTA + corpo + '\n')
    print('scritto %s (%d byte)' % (fuori, os.path.getsize(fuori)))
    print('\nFile da pubblicare accanto alla pagina:')
    print('  assets/styles.css, js/*.js, js/views/*.js, data/manifesto.js, data/blocco-*.js')

if __name__ == '__main__':
    main()
