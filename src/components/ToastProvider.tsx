"use client";

import { useEffect } from "react";
import { ToastContainer, toast } from "@/components/ui";

/**
 * Client wrapper that mounts the global ToastContainer and makes sure
 * frontend failures never stay silent: unhandled promise rejections and
 * uncaught errors are surfaced as consistent in-app notifications.
 *
 * Include once in your root layout.
 */
export function ToastProvider() {
  useEffect(() => {
    let lastMessage = "";
    let lastAt = 0;

    const notify = (cause: unknown) => {
      // User-cancelled fetches/navigations are not failures.
      if (cause instanceof Error && cause.name === "AbortError") return;

      const text =
        typeof cause === "string"
          ? cause
          : cause instanceof Error
            ? cause.message
            : "";

      // Collapse bursts (e.g. several requests failing for the same reason).
      const now = Date.now();
      if (text && text === lastMessage && now - lastAt < 5000) return;
      lastMessage = text;
      lastAt = now;

      toast.error(
        "Something went wrong",
        text || "An unexpected error occurred. Please try again.",
      );
    };

    const onRejection = (e: PromiseRejectionEvent) => notify(e.reason);
    const onError = (e: ErrorEvent) => notify(e.error || e.message);

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return <ToastContainer />;
}
