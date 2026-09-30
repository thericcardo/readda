#!/bin/sh
# Readda - avvio del contenitore.
#
# Esiste per una ragione sola. Il server gira come utente `node`, ma il volume
# che tiene dati-server/ arriva montato da root. Con un volume di Docker il
# problema non si vede, perche' Docker ricopia anche l'appartenenza che la
# cartella ha nell'immagine; con un disco di Fly, che e' un dispositivo a
# blocchi formattato e montato dall'init, no - e la prima scrittura di
# chiavi.json fallirebbe con un permesso negato.
#
# E' una precauzione, non una correzione: qui non gira un demone Docker,
# quindi non l'ho mai vista fallire. Se il volume e' gia' a posto, il chown
# non cambia niente.
set -e
chown -R node:node /app/dati-server 2>/dev/null || true
exec su-exec node node /app/server/server.js "$@"
