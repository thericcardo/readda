# -*- coding: utf-8 -*-
"""Readda - estrazione dal dump del Wikizionario italiano (CC BY-SA 3.0).

Legge il dump compresso e ne ricava le voci utilizzabili: lemma, categoria
grammaticale, sillabazione accentata, definizioni, esempi, sinonimi, etimologia
e marcatori di dominio. Non riscrive nulla: ripulisce il markup e scarta cio'
che non serve (titoli composti, forme flesse, tassonomia, voci senza glossa).

    python3 estrai.py --dump itwikt.xml.bz2 --uscita grezzo.json
"""
import bz2, re, json, sys, unicodedata, collections, html as _html

# ---------- pulizia del markup wiki ----------
RE_FILE   = re.compile(r'\[\[\s*(?:File|Immagine|Image)\s*:[^\]]*\]\]', re.I)
RE_TERM   = re.compile(r'\{\{\s*Term\s*\|\s*([^|}]+)[^}]*\}\}', re.I)
RE_LINKP  = re.compile(r'\{\{\s*Linkp[^}]*\}\}', re.I)
RE_TMPL   = re.compile(r'\{\{[^{}]*\}\}')
RE_WLINK2 = re.compile(r'\[\[[^\]|]*\|([^\]]*)\]\]')
RE_WLINK1 = re.compile(r'\[\[([^\]]*)\]\]')
# collegamento esterno: [url etichetta]. Senza questa, "sicofante" pubblicava
# la definizione con dentro un indirizzo di Wikipedia per esteso.
RE_ELINK  = re.compile(r'\[(?:https?|ftp)://\S+\s+([^\]]*)\]')
RE_ITAL   = re.compile(r"'''?")
RE_HTML   = re.compile(r'<[^>]+>')
RE_SPAZI  = re.compile(r'\s+')

RE_PN = re.compile(r'\{\{\s*Pn\s*(\|[^}]*)?\}\}', re.I)

# ---------- taglio del testo ----------
# Definizioni ed esempi hanno un tetto di caratteri, perche' una carta che non
# sta in una schermata non si legge. Tagliare al carattere numero N pero'
# spezza l'ultima parola a meta', e la maiuscola e il punto aggiunti dopo
# travestono il monco da frase intera: "... attraverso l." sembra finita e non
# lo e'. Si taglia quindi dove finisce una frase, o almeno dove finisce una
# parola, e in quel secondo caso i puntini dicono che il testo prosegue.
CONFINE_FRASE = re.compile(r'[.!?;](?=[\s)]|$)')

def chiudi_taglio(pezzo, minimo=60):
    """Da un testo interrotto a meta' ricava un testo che finisce dove finisce
    una frase; se non ce n'e' una abbastanza lunga, dove finisce una parola.

    Invariante: il risultato non e' mai piu' lungo di `pezzo`, e non finisce
    mai nel mezzo di una parola senza dirlo. La seconda meta' conta quanto la
    prima: costruisci.tipografia() aggiunge un punto a cio' che non ne ha, e
    un monco chiuso dal punto sembra una frase intera. Chiudendo con i
    puntini il punto non viene aggiunto, e la lunghezza resta sotto il tetto:
    e' quello che permette a test/dati.js e a ripara.py di riconoscere un
    taglio vecchio dalla sola lunghezza.
    """
    confini = list(CONFINE_FRASE.finditer(pezzo))
    if confini and confini[-1].start() >= minimo:
        t = pezzo[:confini[-1].start() + 1].rstrip()
        return t[:-1] + '.' if t.endswith(';') else t
    spazio = pezzo.rstrip().rfind(' ')
    if spazio >= minimo:
        return pezzo[:spazio].rstrip(' ,;:(\u00ab"\'') + '\u2026'
    # nessuno spazio su cui appoggiarsi: una sola parola lunghissima, o testo
    # senza spazi uscito dal markup. Si accorcia di un carattere per fare
    # posto ai puntini, cosi' l'invariante di lunghezza regge lo stesso.
    return pezzo[:-1].rstrip(' ,;:(\u00ab"\'') + '\u2026'

def taglia(t, limite, minimo=60):
    """Taglia a `limite` caratteri senza spezzare una parola a meta'.

    La soglia e' `< limite`, non `<= limite`, e la differenza di un carattere
    vale la riga di spiegazione. tipografia() aggiunge un punto a cio' che non
    ne ha: un testo lungo esattamente `limite` e senza punto finale
    diventerebbe lungo `limite + 1`, che e' la firma con cui test/dati.js e
    ripara.py riconoscono un troncamento vecchio. Lasciandolo passare, la
    firma smetterebbe di voler dire qualcosa.

    Il prezzo e' che una definizione lunga per davvero esattamente `limite`
    caratteri viene riportata alla sua ultima frase. E' una perdita piccola e
    circoscritta; l'alternativa e' un criterio che nessuno puo' verificare.
    """
    if len(t) < limite:
        return t
    return chiudi_taglio(t[:limite], minimo)

def pulisci(t, lemma=None):
    t = RE_FILE.sub(' ', t)
    # {{Pn}} sta per il nome della voce: cancellarlo lascia un buco nella frase
    t = RE_PN.sub(lemma if lemma else ' ', t)
    t = RE_LINKP.sub(' ', t)
    for _ in range(4):
        n = RE_TMPL.sub(' ', t)
        if n == t: break
        t = n
    t = RE_WLINK2.sub(r'\1', t)
    t = RE_WLINK1.sub(r'\1', t)
    t = RE_ITAL.sub('', t)
    t = RE_HTML.sub(' ', t)
    t = _html.unescape(_html.unescape(t))     # doppia: il wiki a volte le annida
    t = RE_HTML.sub(' ', t)                    # tag emersi dopo la decodifica
    t = RE_WLINK2.sub(r'\1', t)                # link emersi dopo la decodifica
    t = RE_WLINK1.sub(r'\1', t)
    t = RE_ELINK.sub(r'\1', t)
    t = t.replace('[[', '').replace(']]', '').replace('{{', '').replace('}}', '')
    # le quadre rimaste sono sempre residuo di markup o glossa editoriale del
    # Wikizionario ("dicendo [alcune] cose"): il testo si legge meglio senza
    t = t.replace('[', '').replace(']', '')
    t = RE_SPAZI.sub(' ', t)
    # togliere markup lascia spazi appesi davanti alla punteggiatura
    # ("dalle conifere ]]." diventava "dalle conifere .")
    t = re.sub(r'\s+([.,;:!?])', r'\1', t)
    return t.strip(' ;:,')

# ---------- categorie grammaticali ----------
POS = {'sost': 'nome', 'nome': 'nome', 'agg': 'aggettivo', 'verb': 'verbo', 'avv': 'avverbio'}

# ---------- domini: dai marcatori del Wikizionario ai nostri quindici ----------
DOMINI = {
 'medicina':'medicina','anatomia':'medicina','farmacologia':'medicina','psicologia':'medicina',
 'psichiatria':'medicina','biologia':'medicina','veterinaria':'medicina','chirurgia':'medicina',
 'diritto':'diritto','giurisprudenza':'diritto','burocrazia':'diritto','amministrazione':'diritto',
 'economia':'lavoro','finanza':'lavoro','commercio':'lavoro','marketing':'lavoro','contabilita':'lavoro',
 'lavoro':'lavoro','industria':'lavoro','aziendale':'lavoro',
 'politica':'politica','sociologia':'politica','religione':'politica','storia':'storia','militare':'politica',
 'filosofia':'pensiero','logica':'pensiero','epistemologia':'pensiero','matematica':'pensiero','statistica':'pensiero',
 'linguistica':'lingua','grammatica':'lingua','retorica':'lingua','letteratura':'lingua','letterario':'lingua',
 'poetico':'lingua','editoria':'lingua','filologia':'lingua',
 'informatica':'tecnologia','tecnologia':'tecnologia','ingegneria':'tecnologia','elettronica':'tecnologia',
 'telecomunicazioni':'tecnologia','meccanica':'tecnologia',
 'fisica':'scienza','chimica':'scienza','astronomia':'scienza','geologia':'scienza','scienza':'scienza',
 'botanica':'natura','zoologia':'natura','ecologia':'natura','agricoltura':'natura','geografia':'natura',
 'meteorologia':'natura','marina':'natura','nautica':'natura',
 'gastronomia':'cucina','cucina':'cucina','enologia':'cucina','alimentazione':'cucina',
 'musica':'arte','arte':'arte','architettura':'arte','pittura':'arte','teatro':'arte','cinema':'arte',
 'scultura':'arte','danza':'arte','fotografia':'arte',
 'scuola':'scuola','pedagogia':'scuola','istruzione':'scuola',
}
# marcatori che descrivono il registro, non il campo
REGISTRI = {'letterario':'letterario','poetico':'letterario','antico':'arcaico','arcaico':'arcaico',
            'raro':'raro','desueto':'arcaico','familiare':'familiare','colloquiale':'familiare',
            'gergale':'gergale','popolare':'familiare','volgare':'volgare','regionale':'regionale',
            'tecnico':'tecnico','formale':'formale','burocratico':'burocratico','spregiativo':'spregiativo',
            'scherzoso':'scherzoso','figurato':'figurato'}
# interi settori da scartare: gergo inutile al prodotto
SCARTA_DOMINIO = {'araldica','toponimo','antroponimo','forestierismo','chat','sigla','acronimo',
                  'numismatica','filatelia','tarocchi','scacchi','araldico'}

# definizioni che classificano una specie invece di spiegare una parola:
# per questo prodotto sono zavorra, non lessico
RE_TASSONOMIA = re.compile(
    r'\b(?:famiglia|genere|sottofamiglia|ordine|classe|specie|sottospecie|phylum)\s+(?:del|della|delle|dei|di)\b'
    r'|\b(?:pianta|albero|arbusto|erba|fiore|frutto|uccello|pesce|insetto|mammifero|rettile|mollusco'
    r'|crostaceo|anfibio|fungo|alga|batterio|minerale|roccia)\b.{0,40}\b(?:famiglia|genere|specie|ordine)\b'
    r'|\b[A-Z][a-z]+aceae\b|\bacee\b|\bidae\b'
    r'|\babitante\b.{0,20}\b(?:di|della|del)\b'
    r'|\b(?:relativo|appartenente)\b.{0,24}\b(?:citt\u00e0|regione|comune|provincia|popolo)\b', re.I)

RE_SILL = re.compile(r'\{\{-sill-\}\}\s*\n(.*?)(?=\n\s*\{\{-|\Z)', re.S)
RE_ETIM = re.compile(r'\{\{-etim-\}\}\s*\n(.*?)(?=\n\s*\{\{-|\Z)', re.S)
RE_SIN  = re.compile(r'\{\{-sin-\}\}\s*\n(.*?)(?=\n\s*\{\{-|\Z)', re.S)
RE_POS  = re.compile(r'\{\{-([a-z]+)-\|it')
RE_PAGE = re.compile(r'<title>([^<]+)</title>.*?<text[^>]*>(.*?)</text>', re.S)
ACCENTI = set('àèéìíîòóùúÀÈÉÌÒÙ')

def sillabazione(sez):
    m = RE_SILL.search(sez)
    if not m: return None
    riga = pulisci(m.group(1).split('\n')[0] if '\n' in m.group(1) else m.group(1))
    riga = riga.lstrip('; ').strip()
    if not riga or '|' not in riga: return None
    pezzi = [p.strip() for p in riga.split('|') if p.strip()]
    if not pezzi or len(pezzi) > 9: return None
    testo = '·'.join(pezzi)
    if not any(c in ACCENTI for c in testo): return None      # senza accento tonico non serve
    if not re.fullmatch(r"[A-Za-zÀ-ſ'·\-]+", testo): return None
    return testo

def definizioni_ed_esempi(sez, lemma):
    """Le definizioni stanno su righe che iniziano con # (a qualunque profondita');
    gli esempi sono righe piu' profonde scritte interamente in corsivo."""
    defs, esempi, domini, registri = [], [], [], []
    for riga in sez.split('\n'):
        r = riga.rstrip()
        if not r.startswith('#'): continue
        prof = len(r) - len(r.lstrip('#*:'))
        corpo = r.lstrip('#*: ')
        era_corsivo = corpo.startswith("''") and corpo.rstrip().endswith("''")
        for t in RE_TERM.findall(corpo):
            t = unicodedata.normalize('NFKD', t.strip().lower())
            t = ''.join(c for c in t if not unicodedata.combining(c))
            if t in SCARTA_DOMINIO: return None, None, None, None      # voce da buttare
            if t in DOMINI: domini.append(DOMINI[t])
            if t in REGISTRI: registri.append(REGISTRI[t])
        testo = pulisci(corpo, lemma)
        if not testo: continue
        parole = testo.split()
        if era_corsivo and prof >= 2 and len(parole) >= 4:
            esempi.append(testo); continue
        if len(testo) >= 22 and len(parole) >= 4 and not testo.lower().startswith(('vedi ', 'vedasi')):
            defs.append(testo)
    return defs, esempi, domini, registri

def sinonimi(sez):
    m = RE_SIN.search(sez)
    if not m: return []
    out = []
    for riga in m.group(1).split('\n')[:3]:
        if not riga.strip().startswith('*'): continue
        for s in pulisci(riga.lstrip('* ')).split(','):
            s = s.strip().strip('()')
            if s and 2 < len(s) < 22 and ' ' not in s and s.isalpha(): out.append(s)
    vis, fuori = set(), []
    for s in out:
        if s not in vis: vis.add(s); fuori.append(s)
    return fuori[:5]

# ---------- passata principale ----------
def main(dump, uscita):
    voci, scartate = [], collections.Counter()
    dentro, pezzi, letti = False, [], 0
    with bz2.open(dump, 'rt', encoding='utf-8', errors='replace') as f:
        for riga in f:
            if '<page>' in riga: dentro, pezzi = True, [riga]; continue
            if dentro: pezzi.append(riga)
            if '</page>' in riga and dentro:
                dentro = False
                m = RE_PAGE.search(''.join(pezzi))
                if not m: continue
                titolo, testo = m.group(1), m.group(2)
                letti += 1
                if letti % 40000 == 0: print('  ...%d pagine, %d voci tenute' % (letti, len(voci)), file=sys.stderr)

                if ':' in titolo or ' ' in titolo: scartate['titolo']+=1; continue
                if titolo != titolo.lower(): scartate['maiuscola']+=1; continue
                if not re.fullmatch(r"[a-zà-ÿ']{3,22}", titolo): scartate['forma']+=1; continue
                if '{{-it-}}' not in testo: scartate['non italiano']+=1; continue

                i = testo.find('{{-it-}}')
                j = testo.find('\n== ', i)
                sez = testo[i:j if j > 0 else len(testo)]

                mp = RE_POS.search(sez)
                if not mp or mp.group(1) not in POS: scartate['categoria']+=1; continue
                pos = POS[mp.group(1)]

                sill = sillabazione(sez)
                if not sill: scartate['sillabazione']+=1; continue
                if sill.replace('·','').lower() != unicodedata.normalize('NFKD', titolo) \
                   .encode('ascii','ignore').decode() and \
                   ''.join(c for c in unicodedata.normalize('NFKD', sill.replace('·','').lower())
                           if not unicodedata.combining(c)) != titolo:
                    scartate['sillabazione non combacia']+=1; continue

                defs, esempi, domini, registri = definizioni_ed_esempi(sez, titolo)
                if defs is None: scartate['dominio escluso']+=1; continue
                if not defs: scartate['senza definizione']+=1; continue
                if RE_TASSONOMIA.search(defs[0]): scartate['tassonomia']+=1; continue

                etim = RE_ETIM.search(sez)
                etim = pulisci(etim.group(1).split('\n')[0], titolo) if etim else ''
                etim = taglia(etim, 180, minimo=40)

                voci.append({
                    'id': titolo, 'lemma': titolo, 'pos': pos, 'sill': sill,
                    'def': taglia(defs[0], 260), 'defs': defs[:3],
                    'es': taglia(esempi[0], 200) if esempi else '',
                    'sin': sinonimi(sez),
                    'dom': list(dict.fromkeys(domini)),
                    'reg': list(dict.fromkeys(registri)),
                    'etim': etim,
                })

    print('pagine lette:', letti, file=sys.stderr)
    print('voci tenute :', len(voci), file=sys.stderr)
    print('scartate    :', dict(scartate.most_common()), file=sys.stderr)
    with open(uscita, 'w', encoding='utf-8') as f:
        json.dump(voci, f, ensure_ascii=False)
    return len(voci)

def autoprova():
    """Verifica l'invariante di taglia() su testo generato.

    Serve perche' la meta' del repository che sta a valle - test/dati.js e
    ripara.py - riconosce un troncamento vecchio dalla sola lunghezza. Se
    questo file tornasse a produrre `limite + 1`, quella firma smetterebbe di
    voler dire qualcosa e i due si metterebbero a riparare dati sani.

        python3 strumenti/estrai.py --autoprova
    """
    import random, string, sys as _sys, os as _os
    _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
    import costruisci

    random.seed(20260919)
    alfabeto = string.ascii_lowercase + '  .,;()\u00e0\u00e8'
    rotti, provati = [], 0
    for _ in range(6000):
        t = ''.join(random.choice(alfabeto) for _ in range(random.randint(0, 700)))
        for limite in (260, 200, 180):
            provati += 1
            fuori = costruisci.tipografia(taglia(t, limite))
            if len(fuori) > limite:
                rotti.append((limite, len(fuori), t[:40]))
    # i casi al confine, che il caso generato coglie di rado
    for limite in (260, 200, 180):
        for n in (limite - 2, limite - 1, limite, limite + 1):
            for coda in ('b', '.', ' '):
                provati += 1
                t = 'Una prima frase. ' + 'a' * max(n - 18, 0) + coda
                fuori = costruisci.tipografia(taglia(t, limite))
                if len(fuori) > limite:
                    rotti.append((limite, len(fuori), t[:40]))

    print('taglia(): %d casi, %d violazioni dell\'invariante' % (provati, len(rotti)))
    for r in rotti[:5]:
        print('  limite %d, uscita lunga %d, da %r' % r)
    return 1 if rotti else 0


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Estrae le voci italiane dal dump del Wikizionario.')
    ap.add_argument('--dump', help='itwiktionary-latest-pages-articles.xml.bz2')
    ap.add_argument('--uscita', default='grezzo.json')
    ap.add_argument('--autoprova', action='store_true',
                    help='verifica l\'invariante di taglia() e esce')
    a = ap.parse_args()
    if a.autoprova:
        sys.exit(autoprova())
    if not a.dump:
        ap.error('serve --dump (oppure --autoprova)')
    main(a.dump, a.uscita)
