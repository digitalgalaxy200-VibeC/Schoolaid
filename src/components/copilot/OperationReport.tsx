"use client";

import type { CopilotOperation, OperationStep } from "@/lib/copilot/types";

interface OperationReportProps {
  operation: CopilotOperation;
  steps: OperationStep[];
  summary: string;
}

export function OperationReport({ operation, steps, summary }: OperationReportProps) {
  const successCount = steps.filter((s) => s.status === "completed").length;
  const failCount = steps.filter((s) => s.status === "failed").length;
  const skippedCount = steps.filter((s) => s.status === "skipped").length;
  const isSuccess = operation.status === "completed";

  return (
    <div className="border border-border rounded-sm overflow-hidden bg-surface">
      {/* Header */}
      <div
        className={`px-4 py-3 border-b ${
          isSuccess ? "bg-success-bg border-success" : "bg-warning-bg border-warning"
        }`}
      >
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
          <div>
            <p className="text-small font-semibold">
              {isSuccess ? "Execution Complete" : "Execution Finished with Issues"}
            </p>
            <p className="text-caption text-text-muted">
              {successCount} succeeded{failCount > 0 ? `, ${failCount} failed` : ""}
              {skippedCount > 0 ? `, ${skippedCount} skipped` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-border bg-bg">
        <p className="text-small text-text-secondary whitespace-pre-wrap">{summary}</p>
      </div>

      {/* Steps Detail */}
      <div className="max-h-40 overflow-y-auto">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-2 px-4 py-1.5 border-b border-border last:border-b-0"
          >
            <span
              className={`text-caption font-mono w-16 shrink-0 ${
                step.status === "completed"
                  ? "text-success"
                  : step.status === "failed"
                  ? "text-error"
                  : "text-text-muted"
              }`}
            >
              {step.status}
            </span>
            <span className="text-caption text-text-secondary truncate">{step.description}</span>
          </div>
        ))}
      </div>

      {/* Timing */}
      {operation.started_at && operation.completed_at && (
        <div className="px-4 py-2 border-t border-border bg-bg">
          <p className="text-caption text-text-muted">
            Duration:{" "}
            {Math.round(
              (new Date(operation.completed_at).getTime() - new Date(operation.started_at).getTime()) / 1000
            )}s
          </p>
        </div>
      )}
    </div>
  );
}
