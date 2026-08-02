"use client";

import { type InputHTMLAttributes, type ReactNode, forwardRef, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      required = false,
      error,
      hint,
      icon,
      fullWidth = true,
      className = "",
      id,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const [touched, setTouched] = useState(false);
    const showError = touched && !!error;
    const showSuccess = touched && !error && !!props.value;

    return (
      <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-caption font-medium text-text-primary mb-1.5"
          >
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-text-secondary pointer-events-none">
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={`
              w-full h-12 px-4 text-body
              bg-surface border border-border rounded-md
              placeholder:text-text-disabled
              transition-colors duration-150
              focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15
              disabled:bg-border disabled:cursor-not-allowed disabled:opacity-60
              ${showError ? "border-error focus:border-error focus:ring-error/15" : ""}
              ${showSuccess ? "border-success focus:border-success focus:ring-success/15" : ""}
              ${icon ? "pl-11" : ""}
            `}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
            onBlur={(e) => {
              setTouched(true);
              onBlur?.(e);
            }}
          />
        </div>

        {showError && (
          <p
            id={`${inputId}-error`}
            className="mt-1.5 text-caption text-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {hint && !showError && (
          <p
            id={`${inputId}-hint`}
            className="mt-1.5 text-caption text-text-secondary"
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
