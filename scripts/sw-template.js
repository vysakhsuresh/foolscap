/*
 * Foolscap's service worker, written by scripts/vite-sw.ts at build time.
 * It keeps this site's own files so every tool works with no connection.
 * It never fetches anything from anywhere else, and it never sees a
 * document: documents are opened from your device, not requested.
 */
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const PRECACHE = __PRECACHE__;
const CORE = `foolscap-core-${VERSION}`;
/** OCR models and anything else of ours fetched later, kept after first use. */
const KEPT = 'foolscap-kept';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => BASE + path)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('foolscap-core-') && key !== CORE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    // Pages: the newest when online, the kept copy when not.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CORE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match(BASE))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          // Whole, ordinary responses only: a partial one would be wrong the next time.
          if (response.ok && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(KEPT).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
