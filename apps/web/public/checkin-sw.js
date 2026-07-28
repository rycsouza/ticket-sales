/**
 * Portaria service worker — scoped to /checkin (registered with scope
 * "/checkin"). Conservative offline shell so the gate keeps loading if the
 * venue's connection drops after the operator opened it:
 *   - Content-hashed static assets (/_next/static, fonts, the icon) → cache-first
 *     (immutable, safe to keep forever).
 *   - /checkin navigations → network-first, falling back to the cached page.
 *   - API calls and everything else → passthrough (never cached — check-in data
 *     must stay fresh; offline validation is handled in-app via the pack).
 */
const CACHE = "portaria-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/checkin-icon.svg" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live

  // Cache-first for immutable assets.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Network-first for /checkin navigations, cache fallback when offline.
  if (req.mode === "navigate" && url.pathname.startsWith("/checkin")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          return (await cache.match("/checkin")) ?? Response.error();
        }
      })(),
    );
  }
});
