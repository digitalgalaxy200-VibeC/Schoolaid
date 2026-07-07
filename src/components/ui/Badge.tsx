import { type ReactNode } from "react";

type BadgeVariant =
  "default" | "success" | "warning" | "error" | "info" | "draft";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-border text-text-secondary",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
  info: "bg-info-bg text-info",
  draft: "bg-warning-bg text-warning",
};

export function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-[10px] py-[4px] text-caption font-bold
        rounded-full uppercase tracking-wider
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
