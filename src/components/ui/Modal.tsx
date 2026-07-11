"use client";

import { type ReactNode, useEffect, useCallback } from "react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-spacing-lg">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-surface rounded-radius-xl shadow-xl
          max-h-[85vh] flex flex-col
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-spacing-xl pt-spacing-xl pb-spacing-lg border-b border-border-default">
            <h2 id="modal-title" className="text-heading3 font-semibold text-text-primary">
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-spacing-xl py-spacing-lg">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-spacing-xl pb-spacing-xl pt-spacing-lg border-t border-border-default flex items-center justify-end gap-spacing-md">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
