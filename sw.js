/* Readda — service worker: guscio offline.
 * Non consegna notifiche push: quelle richiedono un server con chiavi VAPID
 * (vedi README). Qui si limita a tenere l'app apribile senza rete. */
var CACHE = 'readda-v1';
var GUSCIO = [
  './', './index.html', './assets/styles.css',
  './data/manifesto.js', './js/corpus.js',
  './js/store.js', './js/srs.js', './js/notify.js', './js/ui.js',
  './js/views/accesso.js', './js/views/profilo.js', './js/views/feed.js',
  './js/views/ripasso.js', './js/views/collezione.js', './js/views/io.js',
  './js/app.js', './manifest.webmanifest'
];

/* I blocchi del corpus non stanno nel guscio: si mettono in cache quando
   vengono chiesti, cosi' la prima apertura resta leggera. */
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(GUSCIO); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chiavi) {
    return Promise.all(chiavi.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (colpo) {
      return colpo || fetch(e.request).then(function (risposta) {
        if (risposta.ok && e.request.url.indexOf(self.location.origin) === 0) {
          var copia = risposta.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return risposta;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});

/* Pronto per il giorno in cui ci sara' un server: i push arrivano qui. */
self.addEventListener('push', function (e) {
  var dati = { titolo: 'Readda', corpo: 'Hai parole in attesa.', rotta: '#/ripasso' };
  try { if (e.data) dati = Object.assign(dati, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(dati.titolo, {
    body: dati.corpo,
    icon: './assets/icona-192.png',
    badge: './assets/icona-192.png',
    tag: 'readda',
    data: { rotta: dati.rotta || '#/ripasso' },
    // la domanda "l'hai usata?" si risponde scrivendo: portare dentro subito
    actions: [{ action: 'apri', title: 'Scrivi una frase' }]
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var rotta = (e.notification.data && e.notification.data.rotta) || '#/ripasso';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if ('focus' in lista[i]) {
        if ('navigate' in lista[i]) lista[i].navigate('./' + rotta).catch(function () {});
        return lista[i].focus();
      }
    }
    if (clients.openWindow) return clients.openWindow('./' + rotta);
  }));
});
