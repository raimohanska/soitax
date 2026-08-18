// Offline-first service worker. The app is one HTML file plus icons, so the
// whole thing fits in a cache and works with no network at all — which is the
// point of installing it to a home screen.
const CACHE = 'pulse-v1';
const SHELL = [
  '.', 'index.html', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any single item 404s, so add
      // individually and tolerate misses
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  // Navigations: serve the cached shell immediately, refresh it in the
  // background. Practising must never wait on a network round trip.
  if(req.mode === 'navigate'){
    e.respondWith(
      caches.match('index.html').then(hit => {
        const fresh = fetch(req)
          .then(r => { caches.open(CACHE).then(c => c.put('index.html', r.clone())); return r; })
          .catch(() => hit);
        return hit || fresh;
      })
    );
    return;
  }

  // Everything else (icons, web fonts): cache-first, then network, and keep
  // whatever comes back so the second launch is fully offline.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if(r && (r.ok || r.type === 'opaque')){
        caches.open(CACHE).then(c => c.put(req, r.clone()));
      }
      return r;
    }).catch(() => hit))
  );
});
