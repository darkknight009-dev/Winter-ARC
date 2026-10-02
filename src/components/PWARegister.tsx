"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable as a PWA.
 *
 * Development is deliberately excluded. In dev, Turbopack emits chunks with
 * path-based (not content-hashed) filenames, so a cache-first service worker
 * serves a stale bundle under a URL that never changes — every code edit is
 * silently ignored until the cache is cleared by hand.
 */
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal */
      });
    }
  }, []);
  return null;
}