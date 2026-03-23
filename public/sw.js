// SW Version for debugging
const SW_VERSION = 'v8-webpush';

// Push notification handler (Web Push API)
self.addEventListener('push', (event) => {
  console.log('[SW:' + SW_VERSION + '] push event received', event);

  if (!event.data) {
    console.warn('[SW] push event has no data');
    // Show a default notification even without data
    event.waitUntil(
      self.registration.showNotification('シフト通知', { body: '新しい通知があります' })
    );
    return;
  }

  let title = 'シフト通知';
  let body = '';
  try {
    const payload = event.data.json();
    console.log('[SW] push payload:', JSON.stringify(payload));
    title = payload.title || title;
    body = payload.body || body;
  } catch (e) {
    body = event.data.text();
    console.log('[SW] push text data:', body);
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png'
    }).then(() => {
      console.log('[SW] showNotification succeeded');
    }).catch((err) => {
      console.error('[SW] showNotification failed:', err);
    })
  );
});

// Respond with SW version when asked
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});

const CACHE_NAME = 'okyuyote-v8';
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
