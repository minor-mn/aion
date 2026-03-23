// Push notification handler (Web Push API)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let title = 'シフト通知';
  let body = '';
  try {
    const payload = event.data.json();
    title = payload.title || title;
    body = payload.body || body;
  } catch (e) {
    body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png'
    })
  );
});

const CACHE_NAME = 'okyuyote-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/images/header-bg.webp',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-HTTP requests (e.g. chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // API requests: network first, no cache fallback
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/users/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: network first, fall back to cache (offline)
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
