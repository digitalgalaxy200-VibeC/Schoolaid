"use client";

import { Button, Card } from "@/components/ui";

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

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", variant = "danger", onConfirm, onCancel, loading }: ConfirmProps) {
  if (!open) return null;

  const variantMap = { danger: "error", primary: "primary", warning: "warning" } as const;
  const color = variantMap[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <Card variant="bordered" className="relative max-w-sm w-full shadow-lg text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${color === "error" ? "bg-error-bg" : color === "warning" ? "bg-warning-bg" : "bg-primary-light"}`}>
          <span className={`text-xl font-bold ${color === "error" ? "text-error" : color === "warning" ? "text-warning" : "text-primary"}`}>!</span>
        </div>
        <h3 className="text-h3 font-bold text-text-primary">{title}</h3>
        <p className="text-small text-text-secondary">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={variant} size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  );
}
