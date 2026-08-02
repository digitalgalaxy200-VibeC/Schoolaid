import { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: number; // percentage change
  trendLabel?: string;
  trendDirection?: "up" | "down" | "neutral"; // if we want to manually override
}

export function KPICard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  trendDirection,
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
        <div className="p-2 bg-primary/10 text-primary rounded-xl">
          {icon}
        </div>
        {trend !== undefined && (
          <div
            className={`flex items-center text-sm font-medium px-2 py-1 rounded-full ${
              direction === "up"
                ? "bg-success/10 text-success"
                : direction === "down"
                ? "bg-error/10 text-error"
                : "bg-surface-hover text-text-secondary"
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
      </div>

      {trendLabel && (
        <div className="mt-4 text-sm text-text-muted">
          {direction === "up" && <span className="text-success">↑</span>}
          {direction === "down" && <span className="text-error">↓</span>}
          {direction === "neutral" && <span>−</span>}
          {" "}
          {trendLabel}
        </div>
      )}
    </div>
  );
}
