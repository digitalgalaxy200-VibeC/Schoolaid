"use client";

import { Button } from "@/components/ui";
import { useEffect, useCallback } from "react";

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  loading,
}: ConfirmProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    },
    [onCancel, loading],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  const colorMap = {
    danger: { bg: "bg-error-bg", text: "text-error", icon: "✕" },
    primary: { bg: "bg-primary-light", text: "text-primary", icon: "!" },
    warning: { bg: "bg-warning-bg", text: "text-warning", icon: "⚠" },
  };
  const { bg, text, icon } = colorMap[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={loading ? undefined : onCancel}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-sm bg-surface rounded-xl border border-border shadow-lg p-6 text-center space-y-5 animate-modal-in"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div
          className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${bg}`}
        >
          <span className={`text-xl font-bold ${text}`}>{icon}</span>
        </div>

        <h3 id="confirm-title" className="text-h2 font-bold text-text-primary">
          {title}
        </h3>

        <p id="confirm-message" className="text-body text-text-secondary">
          {message}
        </p>

        <div className="flex gap-3 justify-center pt-2">
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "warning" ? "danger" : variant}
            size="md"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
