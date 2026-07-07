"use client";

import { Button } from "./Button";
import { Card } from "./Card";

interface ErrorStateProps {
  title?: string;
  message?: string;
  detail?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
  fullPage?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  detail,
  onRetry,
  onGoHome,
  fullPage = false,
}: ErrorStateProps) {
  const content = (
    <div className="text-center space-y-5">
      {/* Icon */}
      <div className="mx-auto w-16 h-16 rounded-full bg-error-bg flex items-center justify-center">
        <svg
          className="w-8 h-8 text-error"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>

      {/* Text */}
      <div>
        <h2 className="text-h2 font-bold text-text-primary">{title}</h2>
        <p className="text-small text-text-secondary mt-2 max-w-md mx-auto">
          {message}
        </p>
        {detail && (
          <p className="text-caption font-mono text-error mt-3 bg-error-bg rounded-sm p-3 max-w-md mx-auto break-all">
            {detail}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            Try Again
          </Button>
        )}
        {onGoHome && (
          <Button variant="secondary" onClick={onGoHome}>
            Go Home
          </Button>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <Card variant="bordered" className="max-w-lg w-full shadow-md">
          {content}
        </Card>
      </div>
    );
  }

  return (
    <Card variant="bordered" className="shadow-sm">
      {content}
    </Card>
  );
}
