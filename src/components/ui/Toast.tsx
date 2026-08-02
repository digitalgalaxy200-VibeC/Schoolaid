"use client";

import { useEffect, useState, useCallback } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let addToastFn: ((toast: Omit<ToastMessage, "id">) => void) | null = null;

export function showToast(toast: Omit<ToastMessage, "id">) {
  if (addToastFn) addToastFn(toast);
}

export const toast = {
  success: (title: string, message?: string) =>
    showToast({ type: "success", title, message }),
  error: (title: string, message?: string) =>
    showToast({ type: "error", title, message }),
  warning: (title: string, message?: string) =>
    showToast({ type: "warning", title, message }),
  info: (title: string, message?: string) =>
    showToast({ type: "info", title, message }),
};

const defaultDurations: Record<ToastType, number> = {
  success: 3000,
  info:    4000,
  warning: 6000,
  error:   0,
};

const bgMap: Record<ToastType, string> = {
  success: "bg-success-bg border-success",
  error:   "bg-error-bg border-error",
  warning: "bg-warning-bg border-warning",
  info:    "bg-info-bg border-info",
};

const textMap: Record<ToastType, string> = {
  success: "text-success",
  error:   "text-error",
  warning: "text-warning",
  info:    "text-info",
};

const iconMap: Record<ToastType, string> = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const duration = toast.duration ?? defaultDurations[toast.type];

  useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-md border shadow-md ${bgMap[toast.type]} animate-slide-up`}
      role="status"
    >
      <span className={`text-lg font-bold shrink-0 ${textMap[toast.type]}`}>
        {iconMap[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-small font-semibold ${textMap[toast.type]}`}>
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-caption text-text-secondary mt-0.5">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-text-secondary hover:text-text-primary text-caption font-bold shrink-0 p-1 -m-1 leading-none"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

const MAX_VISIBLE = 3;

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-50 top-4 right-4 w-full max-w-sm space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
