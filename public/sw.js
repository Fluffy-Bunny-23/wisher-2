const CACHE = "wisher-v2";
const PRECACHE = [
  "/",
  "/dashboard",
  "/login",
  "/signup",
  "/settings",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

function offlineFallbackResponse() {
  const html =
    "<!doctype html><title>Offline</title><meta name=viewport content=\"width=device-width,initial-scale=1\"><body style=\"font-family:sans-serif;padding:2rem;text-align:center\"><h1>You’re offline</h1><p>Connect to the internet to load this page. Cached content is available for pages you’ve visited before.</p><a href=\"/dashboard\">Go to dashboard</a>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  // Fail the install if precaching fails so the browser will retry.
  // Do not swallow addAll rejections.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k.startsWith("wisher-"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET and same-origin-ish requests.
  if (request.method !== "GET") return;

  // Navigations: network-first, fall back to cached app shell for offline reading.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match("/dashboard"))
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || offlineFallbackResponse()),
        ),
    );
    return;
  }

  // Same-origin static + pages: cache-first with background refresh
  // (caches the most recently viewed lists/items for offline reading).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => hit || undefined);
        // Never resolve undefined: return hit immediately if present, otherwise network,
        // and if both miss/fail let the network error propagate (no undefined).
        if (hit) return hit;
        return network.then((res) => {
          if (res) return res;
          // No cache hit and network failed — for non-navigation this is a
          // genuine network error; propagate by rejecting so the browser shows it.
          return Promise.reject(new TypeError("Network unavailable and not cached"));
        });
      }),
    );
    return;
  }

  // Cross-origin (e.g. OG images): network only, never cache opaque responses.
});
