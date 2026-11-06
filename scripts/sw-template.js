/*
 * Foolscap's service worker, written by scripts/vite-sw.ts at build time.
 * It keeps this site's own files so every tool works with no connection.
 * It never fetches anything from anywhere else.
 *
 * The one document it ever touches is one shared to Foolscap from another
 * app ("Share → Foolscap" on a phone): the share arrives as a post to
 * /open/, which is answered here and never reaches the network. The files
 * are held in memory only until the Open a file page asks for them, then
 * let go. They are never cached or stored.
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

/** Files shared to Foolscap, waiting for the Open a file page. */
let shared = [];

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'foolscap:shared?' || !event.source) return;
  event.source.postMessage({ type: 'foolscap:shared', files: shared });
  shared = [];
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (request.method === 'POST' && url.pathname === `${BASE}open/`) {
    // "Share → Foolscap": take the files, then show the page that will ask for them.
    event.respondWith(
      request
        .formData()
        .then((data) => {
          shared = data.getAll('files').filter((file) => file instanceof File);
        })
        .catch(() => {
          shared = [];
        })
        .then(() => Response.redirect(`${BASE}open/?shared`, 303)),
    );
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // Pages: the newest when online, the kept copy when not. The host lets a
    // browser reuse a page for ten minutes, so a visit just after a publish
    // could show the old one; asking the server first (a few hundred bytes
    // when nothing changed) shows the new one at once. A navigation cannot be
    // re-made with other options, so it is fetched by its address, and a
    // redirect (a missing trailing slash) is handed back as a redirect.
    event.respondWith(
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((response) => {
          if (response.redirected) return Response.redirect(response.url, 302);
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
