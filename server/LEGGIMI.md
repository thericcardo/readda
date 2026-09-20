# Il server di Readda

Fa due cose: serve i file dell'app e manda i promemoria push. Nessuna
dipendenza — solo Node e il suo modulo `crypto` — e nessun database: un file
JSON.

```bash
node server/server.js --porta 8080
```

Alla prima esecuzione genera le chiavi VAPID in `dati-server/chiavi.json` e le
stampa. **Conservale**: cambiarle invalida ogni iscrizione esistente, e gli
utenti devono riattivare i promemoria uno per uno.

---

## Perché esiste

Senza server, la domanda che è il cuore di Readda — *«l'hai usata, blandire?»* —
arriva solo mentre l'app è aperta, cioè quando serve meno. Il Web Push richiede
qualcuno che tenga le scadenze e scriva al servizio push del browser: non c'è
modo di programmarlo dal solo lato client.

## Cosa sa di chi lo usa

| Dato | Perché serve |
|---|---|
| Nickname | Per sapere a chi appartiene l'iscrizione |
| Iscrizione push | Indirizzo e chiavi che il browser genera |
| Scadenze con il lemma | Per sapere *quando* svegliare e *quale parola* chiedere |
| Scostamento del fuso | Per non scrivere alle tre di notte |

**Non** sa: email, password, le frasi scritte dagli utenti, cosa hanno
risposto ai test. Quelle restano sul dispositivo.

Non c'è password, quindi alla prima iscrizione il server emette un **gettone**
casuale che il client conserva. Senza quel gettone non si aggiornano né si
cancellano le scadenze di un nickname già iscritto: è l'unica cosa che impedisce
a chiunque indovini un nickname di dirottarne i promemoria.

---

## Metterlo in esercizio

Serve **HTTPS**: i service worker e il Web Push non funzionano in chiaro, tranne
che su `localhost`.

### Con un reverse proxy (Caddy, la via più corta)

```
readda.tuodominio.it {
    reverse_proxy localhost:8080
}
```

Caddy prende il certificato da solo. Poi:

```bash
VAPID_SOGGETTO=mailto:tu@tuodominio.it node server/server.js --porta 8080
```

### Come servizio systemd

```ini
[Unit]
Description=Readda
After=network.target

[Service]
Type=simple
User=readda
WorkingDirectory=/opt/readda
Environment=PORT=8080
Environment=VAPID_SOGGETTO=mailto:tu@tuodominio.it
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Le chiavi restano in `dati-server/chiavi.json` (permessi 600). Se preferisci
passarle dall'ambiente, imposta `VAPID_PUBBLICA` e `VAPID_PRIVATA` e il file non
viene nemmeno creato.

### Cosa mettere nei backup

`dati-server/` per intero. Le chiavi non si rigenerano senza perdere tutti gli
iscritti.

---

## Le rotte

| Rotta | Metodo | Cosa fa |
|---|---|---|
| `/api/chiave` | GET | La chiave VAPID pubblica. L'app la usa anche per capire se c'è un server. |
| `/api/iscrizione` | POST | Registra l'iscrizione push. Restituisce il gettone. |
| `/api/scadenze` | POST | Aggiorna quando tornare a chiedere. Richiede il gettone. |
| `/api/iscrizione` | DELETE | Dimentica tutto di un nickname. Richiede il gettone. |
| tutto il resto | GET | I file dell'app. |

Limite di frequenza: 60 richieste al minuto per indirizzo.

## Quando scrive

- Mai prima delle 9 né dopo le 21, ora locale di chi legge.
- Mai più di un promemoria ogni 6 ore.
- Le scadenze più vecchie di 3 giorni vengono buttate: un promemoria stantio
  è peggio di nessun promemoria.
- La produzione («l'hai usata?») ha sempre la precedenza sul riconoscimento.
- Una risposta 404 o 410 dal servizio push significa che il browser ha revocato
  l'iscrizione: viene cancellata subito.

Regole in `server/scadenze.js`, separate apposta dal resto perché si possano
cambiare e collaudare senza aprire porte.

---

## Cosa è provato e cosa no

```bash
node server/prova-push.js     # cifratura e VAPID
node server/prova-server.js   # API e pianificatore
```

**Provato:**

- La cifratura produce **esattamente** il corpo pubblicato nel vettore di prova
  dell'RFC 8291 — byte per byte, non solo un round-trip con sé stessa.
- La firma VAPID è un ES256 valido, verificabile con la chiave che dichiara.
- Le API respingono endpoint non https, chiavi di lunghezza sbagliata, tipi
  sconosciuti, gettoni errati e più di 60 richieste al minuto.
- Il pianificatore rispetta finestra oraria, distanza minima e scadenze stantie,
  dà la precedenza alla produzione, toglie la parola chiesta e cancella le
  iscrizioni revocate.

**Non provato qui:** la consegna vera. Chromium headless in questo ambiente non
raggiunge il servizio push di Google (`Registration failed - permission
denied`), quindi nessun messaggio è mai arrivato a un browser reale. Va
verificato dove il server sarà ospitato:

```bash
node server/prova-vera.js     # BASE=https://readda.tuodominio.it
```

Si iscrive con un browser vero, manda un push e riporta cosa risponde il
servizio. Una risposta `201` significa preso in carico.
