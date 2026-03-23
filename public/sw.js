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
  const notificationTitle = payload.notification?.title || 'シフト通知';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Fallback push handler in case Firebase SDK doesn't catch the event
self.addEventListener('push', (event) => {
  // Firebase SDK handles most push events via onBackgroundMessage.
  // This is a safety net for any that slip through.
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.notification) {
        const title = data.notification.title || 'シフト通知';
        const options = {
          body: data.notification.body || '',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png'
        };
        event.waitUntil(self.registration.showNotification(title, options));
      }
    } catch (e) {
      // Not JSON or no notification data
    }
  }
});

const CACHE_NAME = 'okyuyote-v5';
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
