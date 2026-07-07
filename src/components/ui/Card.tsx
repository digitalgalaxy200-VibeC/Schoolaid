import { type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg" | "none";
  variant?: "default" | "surface" | "bordered";
  header?: ReactNode;
  footer?: ReactNode;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

const variantStyles = {
  default: "bg-surface shadow-sm",
  surface: "bg-surface",
  bordered: "bg-surface border border-border",
};

export function Card({
  padding = "md",
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
        rounded-md
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {header && (
        <div className={`${paddingStyles[padding]} border-b border-border`}>
          {header}
        </div>
      )}
      <div
        className={
          header || footer ? paddingStyles[padding] : paddingStyles[padding]
        }
      >
        {children}
      </div>
      {footer && (
        <div className={`${paddingStyles[padding]} border-t border-border`}>
          {footer}
        </div>
      )}
    </div>
  );
}
