import { type ReactNode } from "react";

interface IndexCardProps {
  tone?: "ghost" | "solid" | "dark";
  rotate?: number;
  label?: string;
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The recurring visual motif for the landing page: a small paper "record" —
 * an index-card silhouette with a punched eyelet, echoing the report cards
 * and student files SchoolAid replaces and preserves.
 */
export function IndexCard({
  tone = "ghost",
  rotate = 0,
  label,
  lines = 3,
  className = "",
  style,
}: IndexCardProps) {
  const toneClass =
    tone === "solid"
      ? "bg-surface border-border-strong shadow-lg rounded-lg"
      : tone === "dark"
        ? "bg-primary-dark border-primary/40 shadow-lg rounded-lg"
        : "bg-clay border-border shadow-sm rounded-lg rounded-tr-none";

  const lineTone =
    tone === "dark" ? "bg-white/25" : tone === "solid" ? "bg-border-strong" : "bg-border-strong/70";

  return (
    <div
      className={`relative w-44 aspect-[4/3] border ${toneClass} p-4 ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      {tone === "ghost" && (
        <span
          className="absolute right-0 top-0 w-0 h-0"
          style={{
            borderTop: "14px solid var(--color-border-strong)",
            borderLeft: "14px solid transparent",
            opacity: 0.6,
          }}
        />
      )}
      <span
        className={`absolute left-3 top-3 w-3 h-3 rounded-full border-2 ${
          tone === "dark" ? "border-white/30" : "border-border-strong"
        }`}
      />
      <div className="mt-5 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={`block h-1.5 rounded-full ${lineTone}`}
            style={{ width: i === lines - 1 ? "55%" : `${85 - i * 8}%` }}
          />
        ))}
      </div>
      {label && (
        <span
          className={`absolute -right-2 -top-2 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide font-mono uppercase shadow-sm ${
            tone === "dark" ? "bg-accent text-white" : "bg-primary text-white"
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function EyebrowLabel({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  const textClass = tone === "dark" ? "text-white/70" : "text-primary";
  const dotClass = tone === "dark" ? "border-white/50" : "border-primary/60";
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-caption font-semibold uppercase tracking-[0.18em] ${textClass}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full border-2 ${dotClass}`} />
      {children}
    </span>
  );
}
