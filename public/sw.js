/* Minimal service worker: cache-first for static assets, network-first otherwise. */
const CACHE = "winter-arc-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/@supabase")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const isStatic = url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons");
      if (isStatic) {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }
      try {
        return await fetch(req);
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error("offline");
      }
    })()
  );
});
