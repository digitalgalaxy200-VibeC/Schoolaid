// ============================================================
// Audit Logger — writes to copilot_audit_log for every action
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";

export interface AuditEntry {
  /** Null/undefined for super-admin-level actions that have no tenant. */
  schoolId: string | null | undefined;
  superAdminId: string;
  operationId?: string;
  stepId?: string;
  action: string;
  details?: Record<string, unknown>;
  /** Execution trace id (`req_…`) for the step this entry describes. */
  requestId?: string;
  /** "success" | "error" | "unknown" — the outcome, recorded explicitly. */
  resultStatus?: string;
  /** The entity a write touched, where there is one. */
  entityId?: string;
  /** The failure message, recorded as a first-class field rather than prose. */
  error?: string;
}

/**
 * Compose the `details` payload from an entry, folding the structured fields in
 * alongside any free-form ones. Pure, so the shape can be tested without a DB.
 */
export function buildAuditDetails(entry: AuditEntry): Record<string, unknown> | null {
  const details: Record<string, unknown> = { ...(entry.details ?? {}) };
  if (entry.requestId) details.request_id = entry.requestId;
  if (entry.resultStatus) details.result_status = entry.resultStatus;
  if (entry.entityId) details.entity_id = entry.entityId;
  if (entry.error) details.error = entry.error;
  return Object.keys(details).length > 0 ? details : null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("copilot_audit_log").insert({
    school_id: entry.schoolId || null,
    super_admin_id: entry.superAdminId,
    operation_id: entry.operationId || null,
    step_id: entry.stepId || null,
    action: entry.action,
    details: buildAuditDetails(entry),
  });

  if (error) {
    console.error("[copilot] audit log error:", error.message);
  }
}
