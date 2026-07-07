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
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-small font-semibold text-text-secondary mb-2"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-text-muted pointer-events-none">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`
              w-full px-4 py-[10px] text-body
              bg-surface border border-border-strong rounded-sm
              placeholder:text-text-muted
              transition-colors duration-150
              focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary-light
              disabled:bg-border disabled:cursor-not-allowed disabled:opacity-60
              ${error ? "border-error focus:border-error focus:ring-error-bg" : ""}
              ${icon ? "pl-9" : ""}
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
            className="mt-1 text-caption text-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {hint && !error && (
          <p
            id={`${inputId}-hint`}
            className="mt-1 text-caption text-text-muted"
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
