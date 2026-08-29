/*
  PrintFlow service worker — minimal offline shell.
  App-shell + static caching only. NEVER cache authenticated API/data responses or
  file/PDF requests (those are private, signed-URL, and must always hit the network).
*/
const CACHE = 'printflow-shell-v1';
const SHELL = ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept API, auth, or Supabase storage traffic.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/_next/data')) return;
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations, falling back to cached shell/offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/offline'))),
    );
    return;
  }

  // Cache-first for same-origin static assets.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
