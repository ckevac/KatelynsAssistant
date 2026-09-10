const CACHE_NAME = 'ksa-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/api.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// Deliberately NOT precached: js/config.js and data/day-cycle-*.json.
// Both are things you'll edit after first load (the API URL, or next
// year's calendar) — precaching them risks serving a stale copy forever,
// which is exactly what happened during setup. They're still cached
// opportunistically by the network-first handler below, just never
// force-cached at install time.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch calls to the Apps Script backend or Google Fonts.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com') || url.hostname.includes('fonts.g')) {
    return;
  }

  // Network-first for everything in the app: always try to get the
  // latest version, only falling back to the cache if there's no
  // connection. This trades a little offline-freshness for never
  // silently serving stale code/data.
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (event.request.method === 'GET' && networkResponse.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
      }
      return networkResponse;
    }).catch(() => caches.match(event.request))
  );
});
