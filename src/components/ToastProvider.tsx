"use client";

import { ToastContainer } from "@/components/ui";

/**
 * Client wrapper that mounts the global ToastContainer.
 * Include once in your root layout.
 */
export function ToastProvider() {
  return <ToastContainer />;
}
