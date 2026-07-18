"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant =
  "primary" | "accent" | "danger" | "secondary" | "ghost" | "warning";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-text-inverse hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  accent:
    "bg-accent text-[#3A2607] hover:bg-accent-dark hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  danger:
    "bg-error text-text-inverse hover:brightness-90 focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2",
  warning:
    "bg-warning text-text-inverse hover:brightness-90 focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2",
  secondary:
    "bg-surface text-primary border border-primary hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  ghost:
    "bg-transparent text-text-secondary hover:bg-border focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-[14px] py-[8px] text-caption",
  md: "px-[18px] py-[10px] text-small",
  lg: "px-5 py-3 text-body",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-sm transition-all duration-150 ease-out disabled:bg-border disabled:text-text-muted disabled:cursor-not-allowed cursor-pointer select-none touch-manipulation active:scale-[0.98] disabled:active:scale-100 ${sizeStyles[size]} ${variantStyles[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
