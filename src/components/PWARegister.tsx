"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * PWARegister — Phase 8
 * Registers the service worker for offline caching & native-feel app shell.
 *
 * EXCEPT ON PUBLIC SCHOOL WEBSITES (Website Engine). The worker is cache-first
 * for everything except /api, which is right for an app shell and wrong for a
 * school's published page: it would serve a stale site to a returning visitor
 * and make a publish look like it did nothing. Both halves are needed — this
 * guard stops new registrations, and the matching check in `public/sw.js` stops
 * an already-installed worker from intercepting those requests.
 *
 * UPDATES, AND WHY THE PAGE IS TOLD
 * ---------------------------------
 * A worker outlives the deploy that replaced it. Even with the network-first
 * strategy in `public/sw.js`, the page a returning student is already looking at
 * was assembled by the OLD build; the new worker takes over underneath it, and
 * until that page reloads the old code keeps running. That is how a fixed bug is
 * reported twice: the fix shipped, the device did not.
 *
 * So we stop serving yesterday's code silently. When an update is ready this
 * shows an IN-APP banner with one action, and reloads — never a browser dialog.
 *
 * IT WILL NOT RELOAD DURING AN ATTEMPT. A student mid-paper is the one person
 * who must not have the screen pulled from under them: the clock is the server's
 * and answers autosave, but the interruption is theirs to choose. On those
 * routes the banner appears and nothing moves on its own.
 *
 * A FIRST install never reloads: `controllerchange` fires when the very first
 * worker claims the page, and reloading there would punish a brand-new visitor
 * for nothing.
 */

const ATTEMPT_PREFIX = "/student/cbt/attempt/";

export function PWARegister() {
  const pathname = usePathname();
  const isPublicSite = pathname.startsWith("/site/");
  const inAttempt = pathname.startsWith(ATTEMPT_PREFIX);

  const [updateReady, setUpdateReady] = useState(false);
  const reloadedRef = useRef(false);

  // The worker's callbacks outlive the render that registered them, so they read
  // the route from a ref. It is written in an effect, not during render.
  const inAttemptRef = useRef(inAttempt);
  useEffect(() => {
    inAttemptRef.current = inAttempt;
  }, [inAttempt]);

  const reloadOnce = useCallback(() => {
    if (reloadedRef.current) return;
    reloadedRef.current = true;
    window.location.reload();
  }, []);

  useEffect(() => {
    if (isPublicSite) return;
    if (!("serviceWorker" in navigator)) return;

    // `controllerchange` also fires on the FIRST install, when the new worker
    // claims a page that had none. Only a takeover of an existing controller is
    // an update worth reloading for.
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadController) return;
      // Never pull the page from an exam. The banner is up; the student decides.
      if (inAttemptRef.current) {
        setUpdateReady(true);
        return;
      }
      reloadOnce();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        // Do not answer the update check from the HTTP cache. `/sw.js` is served
        // `must-revalidate`, and this makes the browser honour that for the one
        // request that decides whether a device ever updates.
        updateViaCache: "none",
      })
      .then((registration) => {
        // A worker that installed while an older page was open and is waiting.
        if (registration.waiting && hadController) setUpdateReady(true);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // `installed` with a controller already present is a real update;
            // without one it is the first install, which is not.
            if (installing.state === "installed" && hadController) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // A progressive enhancement. Never let registration break the app.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [isPublicSite, reloadOnce]);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
        <p className="min-w-[12rem] flex-1 text-small text-text-primary">
          A new version of SchoolAid is ready.
          {inAttempt ? " Finish your test before reloading." : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUpdateReady(false)}
            className="min-h-[44px] rounded-sm px-3 text-small font-semibold text-text-secondary hover:text-text-primary"
          >
            Later
          </button>
          <button
            type="button"
            onClick={reloadOnce}
            className="min-h-[44px] rounded-sm bg-primary px-4 text-small font-bold text-text-inverse shadow-sm hover:bg-primary-dark"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
