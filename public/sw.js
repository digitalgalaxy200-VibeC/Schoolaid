// SchoolAid Service Worker
//
// STRATEGY, AND WHY IT IS SPLIT THREE WAYS
// ----------------------------------------
//   /api/, /auth/        network only — never cached
//   /_next/static/       cache-first — safe, because those filenames contain a
//                        content hash, so a different build is a different URL
//   everything else      NETWORK-FIRST, cache only as an offline fallback
//
// The third line is the one that was wrong before. The worker used to be
// cache-first for "everything else", which included page navigations and the
// RSC payloads Next.js fetches when you move between screens. A cached page
// shell keeps pointing at the JS chunk names it was built with, so once a shell
// was cached, the worker happily served that build's JavaScript from its cache
// as well — after a deploy, the browser kept running the OLD build.
//
// For a screen that shows money that is the worst possible failure: a student's
// balance can be a day old while the payment history beside it is live, because
// the history came from /api/ and the page did not. Stale code is also how a
// fixed bug looks unfixed to the person reporting it.
//
// Offline still works: a previously visited page falls back to its cached copy
// when the network genuinely fails. What no longer happens is the cache being
// consulted BEFORE the network while the network is fine.
//
// CACHE_NAME is bumped by hand when this file's behaviour changes; the activate
// handler deletes every other cache, so the old shells go with it.
const CACHE_NAME = 'schoolaid-shell-v4';

// Pre-cached on install. Deliberately NOT '/' — the root redirects to /login,
// so caching it stores a redirect for a page nobody should land on twice.
const SHELL_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

/** Content-hashed by the build, so the URL changes whenever the bytes do. */
const IMMUTABLE_PREFIX = '/_next/static/';

// ── Install: pre-cache the shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individually, so one missing icon cannot fail the whole install.
      Promise.all(SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cached. Anything else (the app's writes) goes straight out.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin — not ours to cache.
  if (url.origin !== self.location.origin) return;

  // Money and identity. Always live; a cached answer here is a wrong answer.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Public school websites are content a school publishes, and a stale page is
  // worse than a slower one. The renderer enforces its own gates.
  if (url.pathname.startsWith('/site/')) return;

  // Content-hashed build output. The URL IS the version, so cache-first is both
  // safe and the fastest thing available.
  if (url.pathname.startsWith(IMMUTABLE_PREFIX)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            // Clone SYNCHRONOUSLY, before this response is returned. By the time
            // caches.open() resolves, the page has consumed the body and
            // response.clone() would throw "Response body is already used" —
            // which is exactly why nothing was ever cached.
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        });
      }),
    );
    return;
  }

  // Everything else — navigations, RSC payloads, HTML, unhashed assets.
  // Network first; the cache exists only so the app still opens when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          // Clone synchronously — see the note in the immutable branch above.
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            new Response('You are offline, and this page has not been opened before.', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain' },
            }),
        ),
      ),
  );
});
