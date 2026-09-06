"use client";

import { useEffect } from "react";

/**
 * PWARegister — Phase 8
 * Registers the service worker for offline caching & native-feel app shell.
 * Runs silently client-side. Has zero impact on SSR or functionality.
 */
export function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Fail silently — PWA is a progressive enhancement
        });
    }
  }, []);

  return null;
}
