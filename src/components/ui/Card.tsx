import { type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md" | "lg" | "none";
  variant?: "default" | "surface" | "bordered";
  header?: ReactNode;
  footer?: ReactNode;
}

const paddingStyles = {
  none: "",
  sm: "p-spacing-md",
  md: "p-spacing-lg",
  lg: "p-spacing-xl",
};

const variantStyles = {
  default: "bg-bg-base shadow-sm",
  surface: "bg-bg-surface",
  bordered: "bg-bg-base border border-border-default",
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
        rounded-radius-lg
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {header && (
        <div className={`${paddingStyles[padding]} border-b border-border-default`}>
          {header}
        </div>
      )}
      <div className={header || footer ? paddingStyles[padding] : paddingStyles[padding]}>
        {children}
      </div>
      {footer && (
        <div className={`${paddingStyles[padding]} border-t border-border-default`}>
          {footer}
        </div>
      )}
    </div>
  );
}
