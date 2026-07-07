"use client";

import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      icon,
      fullWidth = true,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-body-sm font-medium text-text-secondary mb-spacing-xs"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span className="absolute inset-y-0 left-0 flex items-center pl-spacing-md text-text-muted pointer-events-none">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`
              w-full px-spacing-lg py-spacing-sm text-body
              bg-bg-base border border-border-default rounded-radius-md
              placeholder:text-text-muted
              transition-colors duration-150
              focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20
              disabled:bg-bg-surface disabled:cursor-not-allowed disabled:opacity-60
              ${error ? "border-error focus:border-error focus:ring-error/20" : ""}
              ${icon ? "pl-spacing-2xl" : ""}
            `}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
        </div>

        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-spacing-xs text-caption text-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-spacing-xs text-caption text-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
