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
      <div className={`px-4 py-3 border-b ${isSuccess ? "bg-success-bg border-success" : "bg-warning-bg border-warning"}`}>
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
            <p className="text-small font-semibold">{isSuccess ? "Completed" : "Completed with issues"}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <p className="text-h3 font-bold text-success">{successCount}</p>
            <p className="text-caption text-text-muted">Success</p>
          </div>
          {failCount > 0 && (
            <div className="text-center">
              <p className="text-h3 font-bold text-error">{failCount}</p>
              <p className="text-caption text-text-muted">Failed</p>
            </div>
          )}
          {skippedCount > 0 && (
            <div className="text-center">
              <p className="text-h3 font-bold text-text-muted">{skippedCount}</p>
              <p className="text-caption text-text-muted">Skipped</p>
            </div>
          )}
        </div>
        <p className="text-caption text-text-secondary">{summary}</p>
      </div>

      {/* Actions detail */}
      <div className="max-h-32 overflow-y-auto">
        <p className="px-4 py-1.5 text-caption font-semibold text-text-muted bg-bg">Actions</p>
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 px-4 py-1.5 border-b border-border last:border-b-0">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              step.status === "completed" ? "bg-success text-text-inverse" :
              step.status === "failed" ? "bg-error text-text-inverse" :
              "bg-border"
            }`}>
              {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : "—"}
            </span>
            <span className="text-caption text-text-secondary truncate flex-1">{step.description}</span>
            <span className="text-[10px] text-text-muted font-mono shrink-0">{step.status}</span>
          </div>
        ))}
      </div>

      {/* Timing */}
      {operation.started_at && operation.completed_at && (
        <div className="px-4 py-2 border-t border-border bg-bg text-caption text-text-muted">
          Duration: {Math.round((new Date(operation.completed_at).getTime() - new Date(operation.started_at).getTime()) / 1000)}s
          {operation.id && <span className="ml-3 font-mono">ID: {operation.id.slice(0, 8)}</span>}
        </div>
      )}
    </div>
  );
}
