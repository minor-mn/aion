// Firebase Messaging for push notifications
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDPXOk42G1_Xm8-4yKj4cdwTdeU8q1PBCY',
  authDomain: 'aion-9cadd.firebaseapp.com',
  projectId: 'aion-9cadd',
  messagingSenderId: '613861935685',
  appId: '1:613861935685:web:e3cd2cbbfb689da3feb12c'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] onBackgroundMessage received:', payload);
  const title = payload.data?.title || payload.notification?.title || 'シフト通知';
  const options = {
    body: payload.data?.body || payload.notification?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png'
  };
  self.registration.showNotification(title, options);
});

// Fallback push handler in case Firebase SDK doesn't catch the event
self.addEventListener('push', (event) => {
  console.log('[SW] push event received:', event.data?.text());
  if (event.data) {
    try {
      const payload = event.data.json();
      const title = payload.data?.title || payload.notification?.title || 'シフト通知';
      const body = payload.data?.body || payload.notification?.body || '';
      const options = {
        body: body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png'
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.error('[SW] push parse error:', e);
      event.waitUntil(
        self.registration.showNotification('シフト通知', {
          body: event.data.text(),
          icon: '/icons/icon-192x192.png'
        })
      );
    }
  }
});

const CACHE_NAME = 'okyuyote-v6';
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
