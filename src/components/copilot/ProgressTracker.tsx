"use client";

import type { OperationStep } from "@/lib/copilot/types";

interface ProgressTrackerProps {
  steps: OperationStep[];
  totalSteps: number;
}

export function ProgressTracker({ steps, totalSteps }: ProgressTrackerProps) {
  const completed = steps.filter((s) => s.status === "completed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const running = steps.filter((s) => s.status === "running").length;
  const progress = totalSteps > 0 ? Math.round((completed / totalSteps) * 100) : 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        );
      case "failed":
        return (
          <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "running":
        return (
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        );
      case "skipped":
        return (
          <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        );
      default:
        return (
          <div className="w-4 h-4 rounded-full border-2 border-border" />
        );
    }
  };

  return (
    <div className="border border-border rounded-sm bg-surface">
      {/* Progress Bar */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-small font-semibold text-text-primary">
            {running > 0 ? "Executing..." : failed > 0 ? "Completed with errors" : "Completed"}
          </span>
          <span className="text-caption text-text-muted font-mono">
            {completed}/{totalSteps} steps
          </span>
        </div>
        <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              failed > 0 ? "bg-warning" : "bg-success"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step List */}
      <div className="max-h-48 overflow-y-auto">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 px-4 py-2 border-b border-border last:border-b-0 ${
              step.status === "running" ? "bg-primary-light" : ""
            }`}
          >
            <div className="mt-0.5 shrink-0">{statusIcon(step.status)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-small text-text-primary truncate">{step.description}</p>
              {step.error_message && (
                <p className="text-caption text-error mt-0.5">{step.error_message}</p>
              )}
            </div>
            <span className="text-caption text-text-muted shrink-0 font-mono">
              {step.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
