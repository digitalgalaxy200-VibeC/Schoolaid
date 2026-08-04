"use client";

import type { ExecutionPlan as ExecutionPlanType } from "@/lib/copilot/types";
import { HIGH_RISK_CAPABILITIES } from "@/lib/copilot/capability-registry";

interface ExecutionPlanProps {
  plan: ExecutionPlanType;
  status: "pending" | "approved" | "cancelled" | "executing" | "completed" | "failed";
  onApprove?: () => void;
  onCancel?: () => void;
}

export function ExecutionPlan({ plan, status, onApprove, onCancel }: ExecutionPlanProps) {
  const isPending = status === "pending";

  // Classify steps by risk
  const hasHighRisk = plan.steps.some((s) => HIGH_RISK_CAPABILITIES.has(s.capability));
  const hasModerateRisk = !hasHighRisk && plan.steps.some((s) => {
    // moderate risk capabilities that deserve a warning
    const moderate = new Set(["update_student", "archive_student", "update_school", "configure_report_card_settings", "apply_assessment_template", "provision_school_admin", "impersonate_school"]);
    return moderate.has(s.capability);
  });

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: "Awaiting Approval", className: "bg-warning-bg border-warning text-warning" },
    approved: { label: "Approved", className: "bg-success-bg border-success text-success" },
    executing: { label: "Executing...", className: "bg-primary-light border-primary text-primary" },
    completed: { label: "Completed", className: "bg-success-bg border-success text-success" },
    failed: { label: "Failed", className: "bg-error-bg border-error text-error" },
    cancelled: { label: "Cancelled", className: "bg-bg border-border text-text-muted" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className="border border-border rounded-sm overflow-hidden bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-small font-semibold text-text-primary">
            Execution Plan
          </p>
          <p className="text-caption text-text-muted">
            {plan.estimatedOperations} operation{plan.estimatedOperations !== 1 ? "s" : ""} estimated
          </p>
        </div>
        <span className={`text-caption font-semibold px-3 py-1 rounded-sm border ${config.className}`}>
          {config.label}
        </span>
      </div>

      {/* High-Risk Block Banner */}
      {hasHighRisk && (
        <div className="px-4 py-3 bg-error-bg border-b border-error flex items-start gap-2">
          <span className="text-error text-base shrink-0">🚫</span>
          <div>
            <p className="text-small font-semibold text-error">Blocked Operation</p>
            <p className="text-caption text-error mt-0.5">
              This plan contains a restricted operation that cannot be executed through the AI Copilot.
              These actions must be performed manually through the SchoolAid admin dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Moderate-Risk Warning Banner */}
      {hasModerateRisk && !hasHighRisk && (
        <div className="px-4 py-3 bg-warning-bg border-b border-warning flex items-start gap-2">
          <span className="text-warning text-base shrink-0">⚠️</span>
          <div>
            <p className="text-small font-semibold text-warning">Review Carefully</p>
            <p className="text-caption text-warning mt-0.5">
              This plan includes significant changes. Please review each step before approving.
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="px-4 py-3 border-b border-border bg-bg">
        <p className="text-small text-text-secondary">{plan.summary}</p>
        <div className="flex gap-4 mt-2">
          <span className="text-caption text-text-muted">
            {plan.estimatedOperations} operation{plan.estimatedOperations !== 1 ? "s" : ""}
          </span>
          {plan.estimatedDuration && (
            <span className="text-caption text-text-muted">{plan.estimatedDuration}</span>
          )}
        </div>
      </div>

      {/* Validation Checks */}
      {plan.validationChecks && plan.validationChecks.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-bg">
          <p className="text-caption font-semibold text-text-muted mb-1">Validation</p>
          {plan.validationChecks.map((v, i) => (
            <p key={i} className="text-caption text-text-secondary flex items-start gap-1">
              <span className="shrink-0">✓</span> {v}
            </p>
          ))}
        </div>
      )}

      {/* Steps */}
      <div className="px-4 py-2 max-h-64 overflow-y-auto">
        <ol className="space-y-1">
          {plan.steps.map((step) => {
            const blocked = HIGH_RISK_CAPABILITIES.has(step.capability);
            return (
              <li
                key={step.order}
                className={`flex items-start gap-2 py-1.5 text-small ${blocked ? "opacity-60" : ""}`}
              >
                <span className={`w-5 h-5 rounded-full text-caption flex items-center justify-center shrink-0 mt-0.5 font-mono ${blocked ? "bg-error-bg text-error" : "bg-primary-light text-primary"}`}>
                  {blocked ? "✕" : step.order}
                </span>
                <span className="text-text-secondary">
                  {step.description}
                  {blocked && <span className="ml-1 text-error font-semibold">[BLOCKED]</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Warnings */}
      {plan.warnings && plan.warnings.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-warning-bg">
          {plan.warnings.map((w, i) => (
            <p key={i} className="text-caption text-warning flex items-start gap-1">
              <span className="shrink-0">⚠</span>
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      {isPending && onApprove && onCancel && (
        <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-sm text-small font-semibold text-text-secondary hover:bg-bg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {!hasHighRisk && (
            <button
              onClick={onApprove}
              className="px-4 py-2 rounded-sm text-small font-semibold bg-primary text-text-inverse hover:bg-primary-dark transition-colors cursor-pointer"
            >
              Approve & Execute
            </button>
          )}
          {hasHighRisk && (
            <span className="px-4 py-2 rounded-sm text-small font-semibold bg-error-bg text-error border border-error cursor-not-allowed">
              Cannot Execute — Blocked
            </span>
          )}
        </div>
      )}

      {/* Status notes */}
      {!isPending && status !== "cancelled" && (
        <div className="px-4 py-2 border-t border-border bg-bg">
          <p className="text-caption text-text-muted text-center">
            {status === "executing" ? "Execution is in progress..." :
             status === "completed" ? "All operations completed." :
             status === "failed" ? "Some operations failed. Check the report for details." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
