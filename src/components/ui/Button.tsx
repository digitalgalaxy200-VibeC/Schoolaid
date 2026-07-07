"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
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
    "bg-brand-primary text-text-inverse hover:brightness-110 active:brightness-95",
  secondary:
    "bg-brand-secondary text-text-inverse hover:brightness-110 active:brightness-95",
  danger:
    "bg-error text-text-inverse hover:brightness-110 active:brightness-95",
  ghost:
    "bg-transparent text-text-primary hover:bg-bg-surface-hover active:bg-bg-surface",
  outline:
    "bg-transparent text-brand-primary border border-brand-primary hover:bg-brand-primary/5 active:bg-brand-primary/10",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-spacing-sm py-spacing-xs text-body-sm",
  md: "px-spacing-lg py-spacing-sm text-body",
  lg: "px-spacing-xl py-spacing-md text-heading4",
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
      className={`
        inline-flex items-center justify-center gap-spacing-sm
        font-medium rounded-radius-md transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        cursor-pointer select-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
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
