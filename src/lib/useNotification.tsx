"use client";

import { useState, useCallback, useRef } from "react";

type NotificationType = "success" | "error" | "warning" | "info";

interface NotificationOptions {
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

/**
 * Hook for showing toast notifications from any component.
 * 
 * Usage:
 *   const notify = useNotification();
 *   notify.success("Student created");
 *   notify.error("Failed to save", "Try again");
 */
export function useNotification() {
  const [toasts, setToasts] = useState<Array<NotificationOptions & { id: string }>>([]);
  const idRef = useRef(0);

  const notify = useCallback((type: NotificationType, title: string, message?: string, duration?: number) => {
    const id = String(++idRef.current);
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
  }, []);

  const success = useCallback((title: string, message?: string) => notify("success", title, message, 4000), [notify]);
  const error = useCallback((title: string, message?: string) => notify("error", title, message, 7000), [notify]);
  const warning = useCallback((title: string, message?: string) => notify("warning", title, message, 5000), [notify]);
  const info = useCallback((title: string, message?: string) => notify("info", title, message, 4000), [notify]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ToastContainer = toasts.length > 0 ? (
    <div className="fixed z-50 space-y-2 top-16 left-4 right-4 tablet:top-auto tablet:left-auto tablet:bottom-4 tablet:right-4 tablet:w-full tablet:max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  ) : null;

  return { notify, success, error, warning, info, ToastContainer };
}

const bgMap: Record<NotificationType, string> = {
  success: "bg-success-bg border-success",
  error: "bg-error-bg border-error",
  warning: "bg-warning-bg border-warning",
  info: "bg-info-bg border-info",
};

const textMap: Record<NotificationType, string> = {
  success: "text-success",
  error: "text-error",
  warning: "text-warning",
  info: "text-info",
};

const iconMap: Record<NotificationType, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: NotificationOptions & { id: string };
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useState(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration ?? 5000);
    return () => clearTimeout(timerRef.current);
  });

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-md border shadow-md ${bgMap[toast.type]} animate-slide-up`}
      role="status"
    >
      <span className={`text-lg font-bold ${textMap[toast.type]}`}>
        {iconMap[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-small font-semibold ${textMap[toast.type]}`}>
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-caption text-text-secondary mt-1">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-text-muted hover:text-text-primary text-caption font-bold flex-shrink-0 p-1 -m-1"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
