import { type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "default" | "elevated" | "clay";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg" | "none";
  variant?: CardVariant;
  header?: ReactNode;
  footer?: ReactNode;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

const variantStyles: Record<CardVariant, string> = {
  default:
    "bg-surface rounded-lg border border-border shadow-sm",
  elevated:
    "bg-surface rounded-xl border border-border shadow-md",
  clay:
    "bg-clay rounded-lg border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]",
};

export function Card({
  padding = "lg",
  variant = "default",
  header,
  footer,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {header && (
        <div className="pb-4 border-b border-border">
          {header}
        </div>
      )}
      <div className={paddingStyles[padding]}>
        {children}
      </div>
      {footer && (
        <div className="pt-4 border-t border-border">
          {footer}
        </div>
      )}
    </div>
  );
}
