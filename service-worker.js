/* Fit with Baljit — service worker
   Strategy:
   - App shell (html/css/js/icons): cache-first, so the app opens instantly and works offline.
   - plan.json: network-first with cache fallback, so content updates arrive on the next heartbeat.
   Bump SHELL_VERSION whenever you change the shell files (not needed for plan.json edits). */
const SHELL_VERSION = 'fwb-shell-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_VERSION && k !== 'fwb-data').map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // plan.json -> network first (fresh content), fall back to cache when offline
  if (url.pathname.endsWith('/plan.json') || url.pathname.endsWith('plan.json')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open('fwb-data').then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // app shell -> cache first
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
