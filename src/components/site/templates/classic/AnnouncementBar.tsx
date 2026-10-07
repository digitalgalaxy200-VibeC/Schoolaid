import type { SiteSection } from "@/lib/site/types";

type NoticeSection = Extract<SiteSection, { kind: "notice" }>;

export function AnnouncementBar({ section }: { section: NoticeSection }) {
  if (!section.message) return null;

  return (
    <div className="relative bg-gradient-to-r from-[var(--site-primary-dark)] via-[var(--site-primary)] to-[var(--site-primary-dark)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-inner">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Notice
        </span>
        <span>{section.message}</span>
        {section.linkUrl && (
          <a
            href={section.linkUrl}
            className="inline-flex items-center gap-1 font-bold text-[var(--site-tint)] underline hover:text-white transition-colors ml-1"
          >
            <span>{section.linkText || "Learn more"}</span>
            <span>→</span>
          </a>
        )}
      </div>
    </div>
  );
}
