// Firebase Messaging Service Worker
// This file must be at the root of the public directory for Firebase to find it
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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'シフト通知';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
