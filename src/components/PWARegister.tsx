"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable as a PWA. */
export function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal */
      });
    }
  }, []);
  return null;
}
