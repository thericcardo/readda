# -*- coding: utf-8 -*-
"""Readda - costruzione del corpus.

Prende le voci grezze estratte dal Wikizionario italiano (CC BY-SA 3.0), le
filtra sulla fascia di frequenza che interessa al prodotto - parole che un
adulto italofono riconosce ma non produce - assegna livello e dominio, fonde
i lemmi curati a mano e scrive i file dati suddivisi in blocchi.

Si puo' rieseguire: le voci gia' pubblicate mantengono il blocco in cui stanno,
cosi' gli aggiornamenti aggiungono senza rimescolare quello che c'e'.
"""
import json, os, re, sys, unicodedata, collections, argparse

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
DATI = os.path.join(RADICE, 'data')

# ---------------------------------------------------------------- fasce
# Sotto la soglia bassa ci sono le parole di tutti i giorni: non sono il
# prodotto. Sopra quella alta c'e' il gergo che nessuno riconosce.
FREQ_MIN      = 1500
FREQ_LIVELLO2 = 20000
FREQ_LIVELLO3 = 80000
FREQ_MAX      = 200000
N_BLOCCHI     = 64      # fisso per sempre: cosi' aggiungere voci non sposta
                        # quelle gia' pubblicate in un altro blocco

# ------------------------------------------------- inferenza del dominio
INDIZI = [
 ('medicina',  r'\b(malatt|sintom|terapi|clinic|diagnos|infiammaz|cura|paziente|medic|chirurg|farmac|organism|sangue|osseo|muscol|nerv)\w*'),
 ('diritto',   r'\b(legge|legale|giuridic|norma|reato|tribunal|contratt|sentenz|process|penale|civile|obblig|diritt|illecit)\w*'),
 ('lavoro',    r'\b(azienda|impresa|mercat|economic|commerc|finanz|denar|profitt|contabil|lavorativ|professional|industrial|produz)\w*'),
 ('politica',  r'\b(stato|govern|politic|elettoral|pubblic|cittadin|social|societ|popolo|nazion|istituz|amministrat)\w*'),
 ('pensiero',  r'\b(ragionament|logic|filosof|concett|astratt|pensier|conoscenz|verit|argoment|deduz|teori|mente|intellett)\w*'),
 ('lingua',    r'\b(parola|termine|linguaggi|discors|frase|scrittur|letterari|stile|grammatic|retoric|espression|verbale|poesia|poetic)\w*'),
 ('tecnologia',r'\b(macchina|apparecch|dispositiv|meccanism|elettric|elettronic|informatic|digital|motore|impiant|tecnic)\w*'),
 ('scienza',   r'\b(fisic|chimic|matematic|energia|misura|calcol|sostanza|molecol|atomic|scientif|esperiment)\w*'),
 ('natura',    r'\b(terreno|montagn|acqua|fiume|mare|clima|vento|pioggia|bosco|cielo|paesagg|geolog|roccia|suolo|vegetaz)\w*'),
 ('cucina',    r'\b(cibo|alimento|cucin|sapore|gastronom|pietanza|bevanda|vino|cottura|dolce|salato|culinar)\w*'),
 ('arte',      r'\b(musica|pittur|scultur|teatr|artistic|melodia|dipint|architettonic|estetic|cinema|danza)\w*'),
 ('emozioni',  r'\b(sentiment|emoz|animo|affett|tristezz|gioia|paura|dolore|piacere|desideri|carattere|indole|umore|passione)\w*'),
 ('tempo',     r'\b(tempo|durata|istante|periodo|epoca|momento|frequenza|ritmo|antic|recent|futur|passato)\w*'),
 ('storia',    r'\b(storic|antichit|medioev|romano|greco|secolo|epoca|civilt|dinastia)\w*'),
 ('scuola',    r'\b(scuola|studio|insegnament|didattic|allievo|apprendiment|universit|educativ)\w*'),
]
INDIZI = [(d, re.compile(r, re.I)) for d, r in INDIZI]

def inferisci_dominio(testo):
    punti = collections.Counter()
    for dom, rx in INDIZI:
        n = len(rx.findall(testo))
        if n: punti[dom] += n
    return [d for d, _ in punti.most_common(2)]

# ------------------------------------------------------------- qualita'
# Due misure distinte, che prima erano confuse in una sola:
#   aderenza = quanto la parola serve al prodotto (decide se entra)
#   scheda   = quanto la voce e' completa (ordina, non esclude)
# Senza questa separazione in cima finiscono "sabotare" e "contagiare", che
# tutti usano gia', e in fondo "zappa" e "siringa", che nessuno deve imparare.

# definizioni che descrivono un oggetto concreto: chi non conosce la parola
# non conosce la cosa, e impararla non cambia come parla
CONCRETO = re.compile(
    r'^(?:\w+\s+){0,3}(?:strumento|attrezzo|utensile|arnese|macchina|macchinario|dispositivo'
    r'|apparecchio|apparato|congegno|meccanismo|recipiente|contenitore|serbatoio|vaschetta'
    r'|veicolo|imbarcazione|natante|velivolo|edificio|costruzione|fabbricato|locale|negozio'
    r'|bottega|minerale|metallo|lega|tessuto|stoffa|indumento|calzatura|copricapo|arma'
    r'|sport|gioco|moneta|banconota|unit\u00e0 di misura|elemento chimico|composto chimico'
    r'|tubo|condotto|valvola|ingranaggio|mobile|utensile)\b', re.I)

# definizioni di cose astratte: e' li' che sta il lessico che cambia come si parla
ASTRATTO = re.compile(
    r'^(?:\w+\s+){0,2}(?:qualit\u00e0|caratteristica|propriet\u00e0|atto|azione|effetto|atteggiamento'
    r'|condizione|stato|situazione|sentimento|emozione|sensazione|impressione|tendenza|inclinazione'
    r'|propensione|disposizione|capacit\u00e0|facolt\u00e0|attitudine|comportamento|modo|maniera'
    r'|processo|fenomeno|principio|concetto|idea|insieme di idee|dottrina|corrente|periodo|momento)\b'
    r'|^(?:il |lo |la )?fatto di\b', re.I)

# voci che rimandano a un'altra parola invece di significare qualcosa
RIMANDO = re.compile(
    r'^(?:forma|variante|voce|grafia)\b.{0,24}\bdi\b'
    r'|^(?:diminutivo|accrescitivo|vezzeggiativo|peggiorativo|dispregiativo|superlativo'
    r'|femminile|maschile|plurale|singolare|participio|gerundio|sinonimo|contrario)\b'
    r'|^(?:lo stesso che|come sopra|vedi\b)', re.I)

STUB = re.compile(r'^(?:che|di|il|la|lo|un|una|per|come)\s+\S+\s*$', re.I)

# Parole il cui senso si ricava da una parola che gia' si conosce: impararle
# non cambia come si parla. E' la differenza fra "distinguibile" e "blandire".
TRASPARENTE = re.compile(
    r'^(?:anti|contro|inter|ultra|super|iper|ipo|sopra|sotto|extra|infra|intra|retro'
    r'|pre|post|pro|auto|multi|pluri|poli|semi|emi|mono|bi|tri|quadri|maxi|mini|micro|macro'
    r'|pseudo|neo|paleo|proto|arci|stra|dis|in|s|ri|re)(?=[a-z]{5,})', re.I)
SUFF_TRASPARENTE = re.compile(r'(?:bile|mente|zione|mento|aggio|ista|ismo|ale|are|oso|ivo|ico)$', re.I)

# aggettivi che dicono solo "appartenente a un luogo o a un popolo"
RELAZIONALE = re.compile(
    r'^che\s+(?:riguarda|concerne|si riferisce|appartiene|è relativo|è proprio)\b'
    r'|^(?:relativo|appartenente|originario|proprio|tipico|caratteristico)\s+(?:a|ai|alla|alle|dei|del|della|di)\b'
    r'|^(?:abitante|nativo|popolo|lingua|dialetto)\b'
    r'|\b(?:Teutoni|popolazione|etnia|città di|regione di|provincia di)\b', re.I)

# schede che descrivono una forma flessa invece di una parola
FORMA_VERBALE = re.compile(
    r'^(?:prima|seconda|terza)\s+persona\b|^\w+\s+persona\s+(?:singolare|plurale)\b'
    r"|\bdell'(?:indicativo|congiuntivo|imperativo|condizionale)\b", re.I)

# una citazione letteraria non e' una definizione: spiega nulla a chi non sa
CITAZIONE = re.compile(r'\s/\s|\(\s*[A-Z][a-z]+\s*\)\s*$|^[A-Z][a-z]+\s+[a-z]+\s+[a-z]+,')

def radice_lemma(lem):
    """Troncamento invece di una lista di suffissi: una lista ha sempre un buco
    (mancava -ico, e "ironico" passava con la definizione "incline all'ironia")."""
    l = lem.lower()
    if len(l) <= 5: return l
    return l[:max(4, len(l) - 3)]

def circolare(v):
    """La definizione ripete il lemma: non insegna, rimanda."""
    r = radice_lemma(v['lemma'])
    if len(r) < 4: return False
    return re.search(r'\b' + re.escape(r), v['def'], re.I) is not None

def aderenza(v, rango):
    """Quanto la voce serve a chi vuole usare meglio la propria lingua."""
    a = 0.0
    # un aggettivo o un verbo entrano subito nel parlato; un nome concreto no
    a += {'aggettivo': 2.5, 'verbo': 3.0, 'avverbio': 1.0, 'nome': 0.5}.get(v['pos'], 0)
    # se il senso si ricava da una parola gia' nota, la voce non insegna nulla
    lem = v['lemma']
    if TRASPARENTE.match(lem) and SUFF_TRASPARENTE.search(lem): a -= 4.0
    elif TRASPARENTE.match(lem): a -= 2.0
    if RELAZIONALE.match(v['def']): a -= 5.0
    # le parole dotte di origine latina o greca sono il cuore del registro alto
    et = v.get('etim', '')
    if re.search(r'\b(?:latino|greco|grecismo|latinismo)\b', et, re.I): a += 1.8
    # la fascia di frequenza e' il segnale piu' forte di "la riconosci ma non la dici"
    if rango is None:            a += 1.5
    elif rango < 4000:           a -= 3.0
    elif rango < 15000:          a += 1.0
    elif rango <= FREQ_MAX:      a += 3.0
    else:                        a += 1.5
    d = v['def']
    if CONCRETO.match(d): a -= 6.0
    elif ASTRATTO.match(d): a += 3.0
    if any(r in v['reg'] for r in ('letterario', 'figurato', 'raro')): a += 2.0
    if 'arcaico' in v['reg']: a -= 1.5      # difficile usarla senza sembrare finti
    if any(r in v['reg'] for r in ('gergale', 'volgare', 'regionale')): a -= 2.0
    return a

def scheda(v):
    """Quanto la voce e' completa come carta da mostrare."""
    p = 0.0
    if v['es']:   p += 3.0
    p += min(len(v['sin']), 4) * 0.6
    if v['etim']: p += 0.8
    if v['dom']:  p += 0.8
    n = len(v['def'])
    p += 2.0 if 45 <= n <= 170 else (1.0 if 30 <= n < 45 else 0.0)
    if len(v['defs']) > 1: p += 0.5
    return p

def tipografia(t):
    """Il Wikizionario scrive le glosse in minuscola e spesso senza punto:
    su una carta accanto a una definizione scritta a mano l'incoerenza si vede."""
    t = t.strip()
    if not t: return t
    if t[0].islower(): t = t[0].upper() + t[1:]
    if t[-1] not in '.!?;:\u2026': t += '.'
    return t

# ---------------------------------------------------- lessico esplicito
# Segnare non vuol dire togliere: le voci restano nel corpus, ma non compaiono
# nel flusso finche' non si accende l'interruttore in Io. Serve perche' un
# flusso casuale puo' pescare "smorzacandela" davanti a chiunque, anche in aula.
#
# NON si segnano i termini clinici (minzione, circoncisione, defecazione) ne'
# quelli neutri su identita' e orientamento (omosessuale, poliamoroso):
# toglierli sarebbe un errore, non una cautela.

# La volgarita' sta nella parola, non nella definizione: il Wikizionario marca
# l'intera voce come volgare se anche una sola accezione lo e', e cosi'
# "marrone" (la castagna) e "sedurre" finivano segnati.
# Le radici sono ancorate all'inizio: cercarle come sottostringhe fa diventare
# esplicite "verificare", "classificare" e "pacificare".
RADICE_VOLGARE = re.compile(
    r'^(?:s|ri|in|stra|scu)?(?:cazz|coglion|puttan|stronz|merd|troi|vaffa|incul|minchi'
    r'|pirl|sborr|bocchin|cacar|cacat|pisci|scoregg|frocio|magnacc|paracul|pippa'
    r'|fellat|sodom|necrofil|pedoporn|pornost|pornodiv|pornograf|masturb|incest'
    r'|lenocin|lenone|guardon|smorzacandel|vaginism|zoccol|mignott)', re.I)

# omografi innocenti che la radice cattura per sbaglio
NON_VOLGARI = {
    'cazzuola', 'cazzotto', 'scazzottata',           # utensile, pugno, rissa
    'piscina', 'piscivoro',                          # vasca, che mangia pesci
    'troiano',                                       # della citta' di Troia
    'zoccolo', 'zoccolaio', 'zoccolare', 'zoccolatura',
    'introito', 'introiti', 'introitare', 'introiezione', 'introiettare',
    'inculcare', 'inculcato',
}

# definizioni che descrivono un atto esplicito: l'ancoraggio evita di segnare
# ogni parola la cui glossa nomini il sesso di passaggio (per esempio "sedurre")
ESPLICITO = re.compile(
    r'^(?:rara |grave )?(?:posizione|pratica|atto|rapporto|congiungimento) sessual'
    r'|^(?:rara |grave )?perversione'
    r'|^(?:atto di |pratica di )?masturbazione'
    r'|^(?:chi |che )?(?:trae|prova) piacere sessuale'
    r'|^induzione.{0,20}prostituzione|^chi.{0,20}prostituzione'
    r'|^(?:attore|attrice).{0,24}pornograf', re.I)

EPITETO = re.compile(
    r'\b(?:insulto|epiteto|appellativo)\b.{0,30}\b(?:rivolto|per|contro|usato)\b'
    r'|\btermine (?:dispregiativo|spregiativo|offensivo|ingiurioso)\b.{0,40}'
    r'\b(?:usato|rivolto|per|verso|contro)\b', re.I)

def esplicito(v):
    lem = v['lemma'].lower()
    if lem in NON_VOLGARI: return False
    if RADICE_VOLGARE.match(lem): return True
    d = v['def']
    return bool(ESPLICITO.search(d) or EPITETO.search(d))

# ---------------------------------------- coerenza fra esempio e lemma
def esempio_valido(es, lemma, forme):
    """Un esempio che non contiene la parola non e' un esempio: sulla carta
    mostra una frase che non c'entra niente con il lemma."""
    if not es: return False
    t = unicodedata.normalize('NFD', es.lower())
    t = ''.join(c for c in t if not unicodedata.combining(c))
    radici = [radice_lemma(lemma)] + [f.lower() for f in (forme or [])]
    return any(re.search(r'\b' + re.escape(r), t) for r in radici if len(r) >= 3)

def livello(rango):
    if rango is None or rango >= FREQ_LIVELLO3: return 3
    if rango >= FREQ_LIVELLO2: return 2
    return 1

REG_PRIORITA = ['letterario', 'arcaico', 'raro', 'figurato', 'burocratico',
                'tecnico', 'formale', 'gergale', 'familiare', 'regionale',
                'spregiativo', 'scherzoso', 'volgare']

def registro(v, lvl):
    for r in REG_PRIORITA:
        if r in v['reg']: return r
    return {1: 'comune', 2: 'formale', 3: 'ricercato'}[lvl]

# ------------------------------------------------------------- pipeline
def carica_frequenze(percorso):
    freq = {}
    with open(percorso, encoding='utf-8') as f:
        for i, riga in enumerate(f):
            p = riga.split()
            if len(p) == 2: freq.setdefault(p[0], i + 1)
    return freq

def carica_curati(percorso):
    """I 134 lemmi scritti a mano: definizioni ed esempi migliori di qualunque
    fonte automatica, quindi vincono sempre in caso di omonimia."""
    if not os.path.exists(percorso): return []
    testo = open(percorso, encoding='utf-8').read()
    i = testo.find('[')
    grezzo = testo[i:testo.rfind(']') + 1]
    grezzo = re.sub(r'/\*.*?\*/', '', grezzo, flags=re.S)
    grezzo = re.sub(r'(\{|,)\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', grezzo)
    grezzo = re.sub(r',\s*([}\]])', r'\1', grezzo)
    return json.loads(grezzo)

def costruisci(grezzo_path, freq_path, curati_path, obiettivo):
    voci = json.load(open(grezzo_path, encoding='utf-8'))
    freq = carica_frequenze(freq_path)
    curati = carica_curati(curati_path)
    print('grezzo: %d voci | frequenze: %d parole | curati: %d' % (len(voci), len(freq), len(curati)))

    scartate = collections.Counter()
    tenute = []
    for v in voci:
        rango = freq.get(v['lemma'])
        if rango is not None and rango < FREQ_MIN:
            scartate['troppo comune'] += 1; continue
        if STUB.match(v['def']):
            scartate['definizione monca'] += 1; continue
        if RIMANDO.match(v['def']):
            scartate['rimanda a altra voce'] += 1; continue
        if FORMA_VERBALE.search(v['def']):
            scartate['forma flessa'] += 1; continue
        if CITAZIONE.search(v['def']):
            scartate['citazione al posto della glossa'] += 1; continue
        if circolare(v):
            scartate['definizione circolare'] += 1; continue

        coda = rango is None or rango > FREQ_MAX
        ad = aderenza(v, rango)
        sc = scheda(v)
        if ad < 1.5:   # 2.5 lasciava fuori troppo lessico generale buono
            scartate['non e\' lessico da prodotto'] += 1; continue
        pt = ad * 2.0 + sc
        if coda:
            # nella coda lunga sta tanto gergo morto: passa solo chi ha
            # segnali forti di essere una parola viva ma rara
            marcata = any(r in v['reg'] for r in ('letterario', 'raro', 'figurato'))
            if not ((v['es'] or len(v['sin']) >= 2) and len(v['def']) >= 35 and (marcata or sc >= 5.0)):
                scartate['coda debole'] += 1; continue

        lvl = livello(rango)
        dom = v['dom'][:2] or inferisci_dominio(v['def'] + ' ' + ' '.join(v['defs']))
        tenute.append({
            'id': v['lemma'], 'lemma': v['lemma'], 'pos': v['pos'], 'sill': v['sill'],
            'def': tipografia(v['def']),
            'es': tipografia(v['es']) if esempio_valido(v['es'], v['lemma'], v.get('forme')) else '',
            'sin': v['sin'][:4],
            'dom': dom or ['generale'], 'lvl': lvl, 'reg': registro(v, lvl),
            'etim': v['etim'], 'pt': round(pt, 2), 'ad': round(ad, 2), 'sc': round(sc, 2),
            'rango': rango or 0, 'sens': 1 if esplicito(v) else 0,
        })

    print('dopo i filtri: %d  (scarti: %s)' % (len(tenute), dict(scartate.most_common())))

    tenute.sort(key=lambda x: -x['pt'])
    if obiettivo and len(tenute) > obiettivo:
        tenute = tenute[:obiettivo]
        print('tenute le %d migliori per punteggio' % obiettivo)

    # i lemmi curati a mano hanno la precedenza sull'omonimo automatico
    per_id = {v['id']: v for v in tenute}
    for c in curati:
        c = dict(c)
        c.setdefault('etim', ''); c.setdefault('pt', 99.0); c.setdefault('rango', 0)
        c['curato'] = True
        c['dom'] = c.get('dom') or ['generale']
        per_id[c['id']] = c
    finali = sorted(per_id.values(), key=lambda x: x['id'])
    print('corpus finale: %d voci (%d curate a mano)' % (finali.__len__(), sum(1 for x in finali if x.get('curato'))))
    return finali

# --------------------------------------------------------------- uscita
def blocco_di(lemma):
    """FNV-1a a 32 bit. Identica alla gemella in js/corpus.js: il blocco di
    un lemma si calcola, non si cerca in un indice da mezzo megabyte."""
    h = 2166136261
    for ch in lemma:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h % N_BLOCCHI

def scrivi(voci):
    os.makedirs(DATI, exist_ok=True)
    for vecchio in os.listdir(DATI):
        if re.fullmatch(r'(?:lemmi-\d+|blocco-\d+|indice)\.js', vecchio):
            os.remove(os.path.join(DATI, vecchio))

    blocchi = [[] for _ in range(N_BLOCCHI)]
    for v in voci:
        blocchi[blocco_di(v['id'])].append(v)

    # 'forme' porta i participi irregolari: senza, il controllo delle frasi
    # torna a rifiutare "ho eluso" per il lemma "eludere".
    # 'curato' dice che la voce e' scritta a mano e non viene dal Wikizionario:
    # senza, l'app attribuisce a una fonte esterna un testo che e' nostro, e
    # FONTI.md dichiara un campo che nei dati pubblicati non c'e'.
    CAMPI = ('id', 'pos', 'sill', 'def', 'es', 'sin', 'dom', 'lvl', 'reg', 'etim',
             'forme', 'sens', 'curato')
    for n, blocco in enumerate(blocchi):
        blocco.sort(key=lambda x: x['id'])
        snello = [{k: v[k] for k in CAMPI if v.get(k)} for v in blocco]
        with open(os.path.join(DATI, 'blocco-%02d.js' % n), 'w', encoding='utf-8') as f:
            f.write('/* Readda - blocco %02d di %d, %d voci.\n'
                    '   Generato da strumenti/costruisci.py: non modificare a mano.\n'
                    '   Fonte: Wikizionario italiano, CC BY-SA 3.0. */\n'
                    % (n, N_BLOCCHI, len(blocco)))
            f.write('window.READDA_BLOCCO(%d,' % n)
            json.dump(snello, f, ensure_ascii=False, separators=(',', ':'))
            f.write(');\n')

    conta_liv = collections.Counter(v['lvl'] for v in voci)
    conta_dom = collections.Counter(d for v in voci for d in v['dom'])
    with open(os.path.join(DATI, 'manifesto.js'), 'w', encoding='utf-8') as f:
        f.write('/* Readda - manifesto del corpus. Generato da strumenti/costruisci.py. */\n')
        f.write('window.READDA_MANIFESTO=')
        json.dump({
            'voci': len(voci), 'blocchi': N_BLOCCHI,
            'perBlocco': [len(b) for b in blocchi],
            'livelli': {str(k): conta_liv[k] for k in sorted(conta_liv)},
            'domini': dict(conta_dom.most_common()),
            'curati': sum(1 for v in voci if v.get('curato')),
            'espliciti': sum(1 for v in voci if v.get('sens')),
            'fonte': 'Wikizionario italiano (CC BY-SA 3.0)',
        }, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    pesi = sorted(os.path.getsize(os.path.join(DATI, 'blocco-%02d.js' % n)) for n in range(N_BLOCCHI))
    print('scritti %d blocchi (%.0f KB in media, %.0f KB il piu\' grande) + manifesto da %.0f KB'
          % (N_BLOCCHI, sum(pesi)/len(pesi)/1024, pesi[-1]/1024,
             os.path.getsize(os.path.join(DATI, 'manifesto.js'))/1024))
    return blocchi

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--grezzo', default='/tmp/claude-0/lessico/grezzo.json')
    ap.add_argument('--frequenze', default='/tmp/claude-0/lessico/freqfull.txt')
    ap.add_argument('--curati', default=os.path.join(QUI, 'curati.js'))
    ap.add_argument('--obiettivo', type=int, default=0, help='massimo di voci automatiche (0 = tutte)')
    a = ap.parse_args()
    scrivi(costruisci(a.grezzo, a.frequenze, a.curati, a.obiettivo))
