"use client";

import { type ReactNode, useEffect, useCallback } from "react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
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
    <div className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center tablet:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — bottom sheet on mobile, centered dialog on tablet+ */}
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-surface rounded-t-2xl tablet:rounded-xl shadow-xl
          max-h-[92dvh] tablet:max-h-[85dvh] flex flex-col
          safe-area-bottom animate-slide-up
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {/* Sheet grabber. Decorative — the sheet is dismissed with the ✕ or by
            tapping the backdrop — but it is what makes the panel read as a sheet
            rather than a dialog that happens to sit at the bottom. */}
        <div className="tablet:hidden pt-2 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 tablet:px-6 tablet:pt-6 tablet:pb-4 border-b border-border-strong shrink-0">
            <h2 id="modal-title" className="text-h2 font-semibold text-text-primary truncate">
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close modal"
              className="shrink-0 min-h-[44px] min-w-[44px] tablet:min-h-0 tablet:min-w-0"
            >
              ✕
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 tablet:px-6 tablet:py-5">
          {children}
        </div>

        {/* Footer — kept outside the scroll area, so the primary action is always
            reachable without scrolling on a phone. */}
        {footer && (
          <div className="px-5 pb-5 pt-4 tablet:px-6 tablet:pb-6 border-t border-border-strong flex flex-wrap items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
