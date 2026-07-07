import { type ReactNode } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "draft";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-bg-surface text-text-secondary border border-border-default",
  success: "bg-success/10 text-success border border-success/20",
  warning: "bg-warning/10 text-warning border border-warning/20",
  error: "bg-error/10 text-error border border-error/20",
  info: "bg-info/10 text-info border border-info/20",
  draft: "bg-status-draft/10 text-status-draft border border-status-draft/20",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-spacing-xs
        px-spacing-sm py-0.5 text-caption font-medium
        rounded-radius-full
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
