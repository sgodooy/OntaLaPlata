// Deja la app disponible sin internet. Primero intenta la red para traer la versión más nueva.
const CACHE = 'vainas-v22';
const ARCHIVOS = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/core.js', 'js/db.js', 'js/tour.js', 'js/efectos.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/cuentas/nu.png', 'icons/cuentas/bancolombia.png', 'icons/cuentas/nequi.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // 'no-cache' obliga a confirmar con el servidor, para no mezclar archivos de versiones distintas.
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
