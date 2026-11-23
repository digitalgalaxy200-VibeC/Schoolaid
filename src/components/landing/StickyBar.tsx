"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, WhatsAppIcon } from "./icons";

/**
 * The mobile action bar.
 *
 * It exists because on a phone the decision usually happens with a thumb, and
 * the application is several screens down. It is deliberately:
 *   - mobile only (the header already carries Apply on larger screens);
 *   - hidden while the application form itself is on screen, because a bar that
 *     covers the form's own submit button is worse than no bar;
 *   - padded with the safe-area inset, so the home indicator never sits on it;
 *   - not animated if the visitor asked for reduced motion (handled globally).
 *
 * The page reserves its height (`.sa-mobile-clearance`), so the bar never covers
 * the footer either.
 */
export function StickyBar({ whatsappHref }: { whatsappHref: string | null }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("apply");
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setHidden(entry.isIntersecting);
      },
      // A little before the section fills the screen: otherwise the bar covers
      // the top of the form for a moment before it disappears.
      { rootMargin: "0px 0px -20% 0px", threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={hidden}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#e6dfd3] bg-[#fbf8f2]/95 backdrop-blur transition-transform duration-200 md:hidden ${
        hidden ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <a
          href="#apply"
          tabIndex={hidden ? -1 : undefined}
          className="sa-btn sa-btn-primary flex-1 min-h-[48px] px-4 text-[15px]"
        >
          Apply
          <ArrowRightIcon className="h-4 w-4" />
        </a>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={hidden ? -1 : undefined}
            className="sa-btn sa-btn-ghost flex-1 min-h-[48px] px-4 text-[15px]"
          >
            <WhatsAppIcon className="h-5 w-5 text-[#1f7a5a]" />
            WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
