# Readda - immagine del server.
#
# Non c'e' uno stadio di costruzione e non c'e' `npm install`: il progetto non
# ha dipendenze a runtime, quindi l'immagine e' Node piu' i file dell'app.
#
# Si copia solo quello che l'app serve davvero, e non il repository intero. Il
# gestore dei file statici serve qualunque cosa stia sotto la radice del
# progetto: copiando tutto, su un dominio pubblico finirebbero anche il diario
# di lavorazione, il piano e i 3,9 MB di schermate. Non e' un buco - e' tutta
# roba gia' pubblica su GitHub - ma non ha niente da fare li' dentro.
#
#   docker build -t readda .
#   docker run -p 8080:8080 -v readda-dati:/app/dati-server readda

FROM node:22-alpine

WORKDIR /app

COPY index.html sw.js manifest.webmanifest ./
COPY assets/ ./assets/
COPY js/ ./js/
COPY data/ ./data/
COPY server/ ./server/

# dati-server/ tiene le chiavi VAPID e le iscrizioni: e' l'unico stato che il
# server abbia. Senza un volume sparisce a ogni riavvio, e con le chiavi se ne
# vanno tutti gli iscritti - che dovrebbero riattivare i promemoria uno per
# uno. Per questo il volume e' dichiarato qui e non lasciato alla memoria di
# chi lancia il contenitore.
RUN mkdir -p dati-server && chown -R node:node /app
VOLUME ["/app/dati-server"]

USER node
ENV PORT=8080
EXPOSE 8080

# Non serve una rotta di salute apposta: /api/chiave e' gia' quella con cui
# l'app capisce se c'e' un server, e risponde solo a macchina in piedi.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/chiave || exit 1

CMD ["node", "server/server.js"]
