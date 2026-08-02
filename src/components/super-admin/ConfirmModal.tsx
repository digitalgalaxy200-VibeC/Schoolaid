"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  requireMatch?: string; // If a text match is required to confirm (e.g., typing school name)
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  requireMatch,
  isLoading = false,
}: ConfirmModalProps) {
  const [matchText, setMatchText] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMatchText("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatchValid = !requireMatch || matchText === requireMatch;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        className="bg-surface rounded-2xl shadow-xl border border-border w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            {description}
          </p>

          {requireMatch && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Type <span className="font-bold select-all bg-surface-hover px-1.5 py-0.5 rounded text-text-primary">{requireMatch}</span> to confirm.
              </label>
              <input
                type="text"
                className="w-full h-10 px-3 rounded-lg border border-border bg-bg text-sm focus:outline-none focus:border-error transition-colors"
                value={matchText}
                onChange={(e) => setMatchText(e.target.value)}
                placeholder={requireMatch}
              />
            </div>
          )}

          <div className="flex gap-3 justify-end mt-8">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              {cancelText}
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              onClick={onConfirm}
              disabled={!isMatchValid || isLoading}
              loading={isLoading}
              className={`flex-1 sm:flex-none ${variant === 'danger' ? 'bg-error hover:bg-error/90 text-white' : ''}`}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
