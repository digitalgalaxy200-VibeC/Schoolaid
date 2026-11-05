"use client";

import { type ReactNode, useEffect, useCallback, useState } from "react";
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

/** How much of the visible screen a sheet may use. Matches `.sheet-max-height`. */
const MOBILE_RATIO = 0.92;
const DESKTOP_RATIO = 0.85;
const DESKTOP_QUERY = "(min-width: 768px)";

type ViewportBox = {
  /** Where the visible area starts — non-zero only while a keyboard is up. */
  top: number;
  /** Height of the area the user can actually see. */
  height: number;
  /** The cap for the sheet itself, derived from `height`. */
  maxHeight: number;
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const [viewport, setViewport] = useState<ViewportBox | null>(null);

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

  /**
   * Follow the VISUAL viewport, not the layout one.
   *
   * `100dvh` and `max-h-[92dvh]` describe the layout viewport, which on a phone
   * does not change when the on-screen keyboard opens — so a bottom sheet stayed
   * full height with its lower half (and its footer) behind the keyboard, and
   * the page scroll was locked by this dialog, leaving that half unreachable.
   * `visualViewport` reports the area that is actually visible, so the sheet is
   * clamped to it and the body scrolls inside whatever space is left.
   */
  useEffect(() => {
    if (!isOpen) {
      setViewport(null);
      return;
    }

    const vv = window.visualViewport;

    const sync = () => {
      const height = Math.round(vv?.height ?? window.innerHeight);
      const top = Math.round(vv?.offsetTop ?? 0);
      const ratio = window.matchMedia(DESKTOP_QUERY).matches
        ? DESKTOP_RATIO
        : MOBILE_RATIO;
      setViewport({ top, height, maxHeight: Math.round(height * ratio) });
    };

    sync();

    // Without a visualViewport, the CSS height cap is the whole story.
    if (!vv) return;

    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex items-end tablet:items-center justify-center tablet:p-4"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height }
          : { top: 0, height: "100%" }
      }
    >
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
          sheet-max-height flex flex-col
          safe-area-bottom animate-slide-up
        `}
        style={viewport ? { maxHeight: viewport.maxHeight } : undefined}
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

        {/* Body. `min-h-0` is stated rather than relied upon: a flex child's
            automatic minimum height is its content, and only the `overflow` rule
            relaxes that. Being explicit keeps the scroll area bounded when the
            panel is capped, so a long form scrolls here instead of pushing the
            footer out of view. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 tablet:px-6 tablet:py-5">
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
