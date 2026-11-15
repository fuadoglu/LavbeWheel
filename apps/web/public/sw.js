/* Generated build-owned manifest is injected by scripts/generate-pwa-artifacts.mjs. */
const BUILD_ID = '__LAVBE_BUILD_ID__';
const PRECACHE_URLS = __LAVBE_PRECACHE_URLS__;
const CORE_CACHE = `lavbe-core-${BUILD_ID}`;
const RUNTIME_CACHE = `lavbe-runtime-${BUILD_ID}`;
const MAX_RUNTIME_ENTRIES = 120;
const MAX_RUNTIME_BYTES = 30 * 1024 * 1024;
const PRIVATE_PATH = /^\/(?:api(?:\/|$)|s(?:\/|$)|admin(?:\/|$)|preview(?:\/|$))/i;
const PRIVATE_QUERY_KEYS = new Set(['token', 'key', 'capability', 'share', 'auth']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const versions = (await caches.keys()).filter((name) => name.startsWith('lavbe-'));
    const prior = versions.filter((name) => name !== CORE_CACHE && name !== RUNTIME_CACHE).slice(-2);
    await Promise.all(versions.filter((name) => ![CORE_CACHE, RUNTIME_CACHE, ...prior].includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'LAVBE_ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || PRIVATE_PATH.test(url.pathname) || [...url.searchParams.keys()].some((key) => PRIVATE_QUERY_KEYS.has(key.toLowerCase()))) return;
  if (url.search) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && PRECACHE_URLS.includes(url.pathname)) {
          const cache = await caches.open(CORE_CACHE);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(url.pathname);
        if (cached) return cached;
        return new Response('This page is not available offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_astro/') || /\.[a-f0-9]{8,}\./i.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
      const body = await response.clone().arrayBuffer();
      const size = body.byteLength;
      if (response.ok && Number.isFinite(size) && size > 0 && size <= MAX_RUNTIME_BYTES) {
        const cache = await caches.open(RUNTIME_CACHE);
        const cachedResponse = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        cachedResponse.headers.set('X-Lavbe-Cache-Bytes', String(size));
        await cache.put(request, cachedResponse);
        let keys = await cache.keys();
        let total = 0;
        for (const key of keys) total += Number((await cache.match(key))?.headers.get('X-Lavbe-Cache-Bytes')) || 0;
        while (keys.length > MAX_RUNTIME_ENTRIES || total > MAX_RUNTIME_BYTES) {
          const oldest = keys.shift();
          if (!oldest) break;
          total -= Number((await cache.match(oldest))?.headers.get('X-Lavbe-Cache-Bytes')) || 0;
          await cache.delete(oldest);
        }
      }
      return response;
    })));
  }
});
