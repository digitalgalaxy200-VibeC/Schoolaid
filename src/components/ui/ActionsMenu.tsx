"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

/**
 * A single "Actions" control for a table row.
 *
 * WHY A PORTAL
 * ------------
 * The student tables live inside `overflow-x-auto` wrappers. An absolutely
 * positioned menu inside them is clipped as soon as it leaves the row, which is
 * exactly what a dropdown does. The menu is therefore rendered into `body` and
 * positioned from the trigger's viewport rect, so it behaves the same in a
 * scrolling table, on a phone, and in the last row of the page.
 *
 * ACCESSIBILITY
 * -------------
 * The trigger is a real button with `aria-haspopup="menu"` and
 * `aria-expanded`; items are buttons with `role="menuitem"`. Opening focuses the
 * first item, Arrow keys wrap through them, Escape closes and restores focus to
 * the trigger, and Tab closes the menu so focus continues through the page.
 */

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** `danger` is for archiving; `warning` for credential resets. */
  tone?: "default" | "danger" | "warning";
  disabled?: boolean;
};

export type ActionMenuGroup = {
  label?: string;
  items: ActionMenuItem[];
};

type Props = {
  groups: ActionMenuGroup[];
  label?: string;
  /** Accessible name for the menu, e.g. "Actions for Jane Doe". */
  ariaLabel?: string;
};

const ITEM_BASE =
  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-small font-medium transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:text-text-disabled";

function itemTone(tone: ActionMenuItem["tone"]): string {
  if (tone === "danger") return "text-error hover:bg-error-bg focus-visible:bg-error-bg";
  if (tone === "warning") return "text-warning hover:bg-warning-bg focus-visible:bg-warning-bg";
  return "text-text-primary hover:bg-bg focus-visible:bg-bg";
}

export function ActionsMenu({ groups, label = "Actions", ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menu = menuRef.current;
    const width = menu?.offsetWidth || 232;
    const height = menu?.offsetHeight || 0;
    const margin = 8;

    const left = Math.min(
      Math.max(margin, rect.right - width),
      Math.max(margin, window.innerWidth - width - margin),
    );

    let top = rect.bottom + 4;
    if (height > 0 && top + height > window.innerHeight - margin) {
      const above = rect.top - height - 4;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }

    setPosition({ top, left });
  }, []);

  // Measure after the menu mounts (before paint) so it never appears on top of
  // the trigger and then jump.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);

    // Focus the first actionable item once the menu is on screen.
    const frame = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      );
      first?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || [],
    );
    if (items.length === 0) return;

    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
    if (event.key === "ArrowUp") next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    if (event.key === "End") next = items.length - 1;
    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-caption font-semibold text-text-secondary transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel ? `${ariaLabel} menu` : `${label} menu`}
            onKeyDown={moveFocus}
            style={{ position: "fixed", top: position.top, left: position.left, width: 232 }}
            className="z-[60] max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl animate-fade-in"
          >
            {groups.map((group, groupIndex) => (
              <div
                key={group.label ?? `group-${groupIndex}`}
                role="group"
                aria-label={group.label}
                className={groupIndex > 0 ? "mt-1 border-t border-border pt-1" : ""}
              >
                {group.label && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className={`${ITEM_BASE} ${itemTone(item.tone)}`}
                  >
                    {item.icon && (
                      <span className="shrink-0" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span className="flex-1">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
