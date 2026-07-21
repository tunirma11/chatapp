const CACHE_NAME = "gitbridge-v61";

const ASSETS = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.json",
  "./css/app.css",
  "./js/constants.js",
  "./js/firebase-config.js",
  "./js/firebase.js",
  "./js/push-config.js",
  "./js/push.js",
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
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // JS/CSS: network-first so Safari/PWA picks up deploys without reinstall
  const isCodeAsset =
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith("sw.js");

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener("push", (event) => {
  let title = "Today is rainy day";
  try {
    const data = event.data ? event.data.json() : null;
    const text = String(data?.title || data?.body || data?.message || "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim();
    if (text) title = text;
  } catch {
    try {
      const raw = String(event.data?.text?.() || "")
        .replace(/https?:\/\/\S+/gi, "")
        .trim();
      if (raw) title = raw;
    } catch {
      /* keep default */
    }
  }

  const NOTIFY_TAG = "gitbridge-chat-notify";

  // Close any existing drawer items with this tag, then show one replacement.
  event.waitUntil(
    (async () => {
      const existing = await self.registration.getNotifications({ tag: NOTIFY_TAG });
      for (const n of existing) n.close();
      // Also close legacy tag from older builds
      const legacy = await self.registration.getNotifications({ tag: "gitbridge-m1-notify" });
      for (const n of legacy) n.close();

      await self.registration.showNotification(title, {
        body: undefined,
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        tag: NOTIFY_TAG,
        renotify: true,
        silent: false,
        data: { kind: "chat-text-only" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Focus existing tab only — do not put any URL into the notification message.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return undefined;
    })
  );
});
