import { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  /**
   * Absolute change, e.g. "+1 this month".
   *
   * Percentages are deliberately NOT the default any more: with a base of four
   * schools, "+12%" is either invented or meaningless. A count computed from
   * stored dates is honest; a percentage of a tiny base is theatre.
   */
  delta?: string;
  trend?: number; // percentage change — only for screens with a real baseline
  trendLabel?: string;
  trendDirection?: "up" | "down" | "neutral"; // if we want to manually override
  /** Shown under the title when a figure needs a definition. */
  hint?: string;
}

export function KPICard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  trendDirection,
  delta,
  hint,
}: KPICardProps) {
  const direction =
    trendDirection ||
    (trend !== undefined && trend > 0
      ? "up"
      : trend !== undefined && trend < 0
      ? "down"
      : "neutral");

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-primary-light text-primary rounded-xl">
          {icon}
        </div>
        {trend !== undefined && (
          <div
            className={`flex items-center text-sm font-medium px-2.5 py-1 rounded-full ${
              direction === "up"
                ? "bg-success-bg text-success"
                : direction === "down"
                ? "bg-error-bg text-error"
                : "bg-bg text-text-secondary"
            }`}
          >
            {direction === "up" && <ArrowUpRight className="w-4 h-4 mr-1" />}
            {direction === "down" && <ArrowDownRight className="w-4 h-4 mr-1" />}
            {direction === "neutral" && <Minus className="w-4 h-4 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      
      <div>
        <h3 className="text-4xl font-bold text-text-primary mb-1">{value}</h3>
        <p className="text-sm text-text-muted uppercase tracking-wide">
          {title}
        </p>
        {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
      </div>

      {delta ? (
        <div className="mt-4 text-sm text-text-secondary">{delta}</div>
      ) : trendLabel ? (
        <div className="mt-4 text-sm text-text-muted">
          {direction === "up" && <span className="text-success">↑</span>}
          {direction === "down" && <span className="text-error">↓</span>}
          {direction === "neutral" && <span>−</span>}
          {" "}
          {trendLabel}
        </div>
      ) : null}
    </div>
  );
}
