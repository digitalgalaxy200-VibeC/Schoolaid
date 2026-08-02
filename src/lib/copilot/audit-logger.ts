// ============================================================
// Audit Logger — writes to copilot_audit_log for every action
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";

export interface AuditEntry {
  schoolId: string;
  superAdminId: string;
  operationId?: string;
  stepId?: string;
  action: string;
  details?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("copilot_audit_log").insert({
    school_id: entry.schoolId,
    super_admin_id: entry.superAdminId,
    operation_id: entry.operationId || null,
    step_id: entry.stepId || null,
    action: entry.action,
    details: entry.details || null,
  });

  if (error) {
    console.error("[copilot] audit log error:", error.message);
  }
}
