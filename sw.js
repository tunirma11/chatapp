const CACHE_NAME = "gitbridge-v38";

const ASSETS = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.json",
  "./css/app.css",
  "./js/constants.js",
  "./js/firebase-config.js",
  "./js/firebase.js",
  "./js/store.js",
  "./js/users.js",
  "./js/errors.js",
  "./js/offline.js",
  "./js/router.js",
  "./js/rooms.js",
  "./js/admin.js",
  "./js/room-gate.js",
  "./js/crypto-utils.js",
  "./js/auth.js",
  "./js/chat.js",
  "./js/messaging/message-model.js",
  "./js/messaging/messages.js",
  "./js/messaging/presence.js",
  "./js/messaging/links.js",
  "./js/messaging/media.js",
  "./js/ui/format.js",
  "./js/ui-messages.js",
  "./js/ui.js",
  "./js/ui-admin.js",
  "./js/sounds.js",
  "./js/app.js",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./icons/og-image.svg",
  "./icons/favicon.ico",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/og-image.jpg",
];

const FIREBASE_HOSTS = [
  "firestore.googleapis.com",
  "firebase.googleapis.com",
  "firebasestorage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "www.googleapis.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (FIREBASE_HOSTS.some((host) => url.hostname.includes(host))) return;
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 404) {
            return caches.match("./index.html");
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
