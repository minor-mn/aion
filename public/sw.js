// SW Version — bump this on every deploy to trigger update + client reload
const SW_VERSION = 'v11-webpush';

// Push notification handler (Web Push API)
self.addEventListener('push', (event) => {
  let title = 'シフト通知';
  let body = '';

  if (!event.data) {
    event.waitUntil(
      self.registration.showNotification(title, { body: '新しい通知があります' })
    );
    return;
  }

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

// Respond with SW version when asked
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

const CACHE_NAME = 'okyuyote-v11';
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
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        STATIC_ASSETS.map(url =>
          fetch(url, { cache: 'no-store' }).then(res => cache.put(url, res))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll().then(clients => {
       clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
     }))
  );
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
  // Use cache:'no-store' to bypass nginx's Cache-Control: max-age=86400
  const freshRequest = new Request(event.request, { cache: 'no-store' });
  event.respondWith(
    fetch(freshRequest).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
