/* Winter Arc OS service worker: static caching + web push. */
const CACHE = "winter-arc-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

/* Allow the page to force-activate a waiting worker (push subscribe
   fails while an updated SW sits in "waiting"). */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
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

/* ------------------------------ web push ------------------------------ */

self.addEventListener("push", (event) => {
  let data = { title: "Winter Arc", body: "The day is waiting.", tag: "wao", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* payload wasn't JSON — fall back to defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      // Replaces the previous nudge instead of stacking 4 of them.
      renotify: true,
      requireInteraction: false,
      badge: "/icons/icon-192.png",
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/" },
      // Android: keep the app's silent rules; we do not vibrate on roast.
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.pathname === target && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          await client.focus();
          try {
            await client.navigate(target);
            return client;
          } catch {
            /* fall through to openWindow */
          }
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
