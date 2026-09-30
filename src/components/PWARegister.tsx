"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * PWARegister — Phase 8
 * Registers the service worker for offline caching & native-feel app shell.
 * Runs silently client-side. Has zero impact on SSR or functionality.
 *
 * EXCEPT ON PUBLIC SCHOOL WEBSITES (Website Engine). The worker is cache-first
 * for everything except /api, which is right for an app shell and wrong for a
 * school's published page: it would serve a stale site to a returning visitor
 * and make a publish look like it did nothing. Both halves are needed — this
 * guard stops new registrations, and the matching check in `public/sw.js` stops
 * an already-installed worker from intercepting those requests.
 */
export function PWARegister() {
  const pathname = usePathname();
  const isPublicSite = pathname.startsWith("/site/");

  useEffect(() => {
    if (isPublicSite) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Fail silently — PWA is a progressive enhancement
        });
    }
  }, [isPublicSite]);

  return null;
}
