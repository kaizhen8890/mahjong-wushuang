const CACHE_NAME = 'mahjong-wushuang-table-v15';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/cards/core/mahjong-wushuang-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let assets = CORE_ASSETS;
    try {
      const response = await fetch('/precache-manifest.json', { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        if (Array.isArray(manifest.assets)) assets = [...new Set([...CORE_ASSETS, ...manifest.assets])];
      }
    } catch {
      // Development mode may not have a generated precache manifest yet.
    }
    for (let index = 0; index < assets.length; index += 8) {
      await Promise.allSettled(assets.slice(index, index + 8).map((asset) => cache.add(asset)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put('/index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
