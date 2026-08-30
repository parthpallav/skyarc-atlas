const CACHE_NAME = "skyarc-atlas-v1";
const STATIC_ASSETS = [
  "/",
  "/login",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Soft fallback for initial installation
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Don't intercept API or non-http requests
  if (url.pathname.startsWith("/api") || url.port === "3001" || !url.protocol.startsWith("http")) {
    return;
  }

  // Network-first for dynamic navigation, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
