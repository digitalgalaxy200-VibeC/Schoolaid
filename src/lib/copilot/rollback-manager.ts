// ============================================================
// Rollback Manager — reverses completed operations by
// replaying steps in reverse order. Uses the rollback_info
// stored during execution to know what to undo.
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";
import type { CopilotOperation, OperationStep } from "./types";
import { logAudit } from "./audit-logger";

export interface RollbackResult {
  success: boolean;
  operation: CopilotOperation;
  steps: OperationStep[];
  summary: string;
}

export async function rollbackOperation(
  operationId: string,
  schoolId: string,
  superAdminId: string,
): Promise<RollbackResult> {
  const supabase = getServiceClient();

  // 1. Fetch the operation
  const { data: operation, error: opErr } = await supabase
    .from("copilot_operations")
    .select("*")
    .eq("id", operationId)
    .eq("school_id", schoolId)
    .single();

  if (opErr || !operation) {
    throw new Error("Operation not found");
  }

  if (operation.status === "rolled_back") {
    throw new Error("Operation has already been rolled back");
  }

  if (operation.status !== "completed" && operation.status !== "failed") {
    throw new Error(`Cannot rollback operation in "${operation.status}" status`);
  }

  // 2. Fetch steps in reverse order
  const { data: steps } = await supabase
    .from("copilot_operation_steps")
    .select("*")
    .eq("operation_id", operationId)
    .eq("status", "completed") // only rollback completed steps
    .order("step_order", { ascending: false });

  if (!steps || steps.length === 0) {
    throw new Error("No completed steps to rollback");
  }

  await logAudit({
    schoolId,
    superAdminId,
    operationId,
    action: "rollback_started",
    details: { stepCount: steps.length },
  });

  // 3. Reverse each step
  let rolledBack = 0;
  let failed = 0;

  for (const step of steps) {
    try {
      await reverseStep(step as OperationStep, schoolId);
      rolledBack++;

      await supabase
        .from("copilot_operation_steps")
        .update({ status: "rolled_back", completed_at: new Date().toISOString() })
        .eq("id", step.id);

      await logAudit({
        schoolId,
        superAdminId,
        operationId,
        stepId: step.id,
        action: "rollback_step_completed",
        details: { capability: step.capability, description: step.description },
      });
    } catch (err: any) {
      failed++;
      console.error(`[copilot] Rollback step ${step.step_order} failed:`, err.message);

      await supabase
        .from("copilot_operation_steps")
        .update({
          status: "failed",
          error_message: `Rollback failed: ${err.message}`,
        })
        .eq("id", step.id);

      await logAudit({
        schoolId,
        superAdminId,
        operationId,
        stepId: step.id,
        action: "rollback_step_failed",
        details: { capability: step.capability, error: err.message },
      });
    }
  }

  // 4. Update operation status
  const finalStatus = failed === 0 ? "rolled_back" : "failed";

  const { data: updatedOp } = await supabase
    .from("copilot_operations")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq("id", operationId)
    .select("*")
    .single();

  // Refresh steps
  const { data: finalSteps } = await supabase
    .from("copilot_operation_steps")
    .select("*")
    .eq("operation_id", operationId)
    .order("step_order");

  await logAudit({
    schoolId,
    superAdminId,
    operationId,
    action: finalStatus === "rolled_back" ? "rollback_completed" : "rollback_partial",
    details: { rolledBack, failed },
  });

  const summary =
    failed === 0
      ? `✅ Successfully rolled back ${rolledBack} operation(s).`
      : `⚠️ Rolled back ${rolledBack}/${rolledBack + failed} steps. ${failed} step(s) could not be reversed.`;

  return {
    success: finalStatus === "rolled_back",
    operation: updatedOp as CopilotOperation,
    steps: (finalSteps || []) as OperationStep[],
    summary,
  };
}

// ── Step Reversal ──────────────────────────────────────────

async function reverseStep(step: OperationStep, schoolId: string): Promise<void> {
  const supabase = getServiceClient();

  switch (step.capability) {
    // ── Students ──────────────────────────
    case "create_student": {
      // Archive the created student
      const createdId = (step.response_data as any)?.id;
      if (!createdId) throw new Error("Cannot identify created resource for rollback");

      const { data: s } = await supabase
        .from("students")
        .select("profile_id")
        .eq("id", createdId)
        .eq("school_id", schoolId)
        .single();

      if (s?.profile_id) {
        await supabase.from("profiles").update({ is_active: false }).eq("id", s.profile_id);
      }
      return;
    }

    case "archive_student": {
      // Reverse the archive by toggling is_active back
      const params = step.input_params as Record<string, unknown> | null;
      const studentId = params?.id as string;
      if (!studentId) throw new Error("Missing student ID for rollback");

      const { data: s } = await supabase
        .from("students")
        .select("profile_id")
        .eq("id", studentId)
        .eq("school_id", schoolId)
        .single();

      if (s?.profile_id) {
        const wasActive = !params?.is_active;
        await supabase.from("profiles").update({ is_active: wasActive }).eq("id", s.profile_id);
      }
      return;
    }

    // ── Teachers ──────────────────────────
    case "create_teacher": {
      const createdId = (step.response_data as any)?.id;
      if (!createdId) throw new Error("Cannot identify created teacher for rollback");

      const { data: t } = await supabase
        .from("teachers")
        .select("profile_id")
        .eq("id", createdId)
        .eq("school_id", schoolId)
        .single();

      if (t?.profile_id) {
        await supabase.from("profiles").update({ is_active: false }).eq("id", t.profile_id);
      }
      return;
    }

    case "assign_teacher_to_class": {
      const params = step.input_params as Record<string, unknown> | null;
      const teacherId = params?.teacher_id;
      const classId = params?.class_id;

      if (teacherId && classId) {
        await supabase
          .from("class_teachers")
          .update({ is_active: false })
          .eq("teacher_id", teacherId)
          .eq("class_id", classId)
          .eq("school_id", schoolId);
      }
      return;
    }

    case "assign_teacher_to_subject": {
      const params = step.input_params as Record<string, unknown> | null;
      if (params?.teacher_id && params?.subject_id && params?.class_id) {
        await supabase
          .from("teacher_subjects")
          .delete()
          .eq("teacher_id", params.teacher_id)
          .eq("subject_id", params.subject_id)
          .eq("class_id", params.class_id)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Classes ───────────────────────────
    case "create_class": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        // Soft-delete by deactivating
        await supabase
          .from("classes")
          .update({ status: "disabled" })
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Subjects ──────────────────────────
    case "create_subject": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("subjects")
          .update({ status: "disabled" })
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    case "assign_subject_to_class": {
      const params = step.input_params as Record<string, unknown> | null;
      if (params?.subject_id && params?.class_id) {
        await supabase
          .from("subject_class_assignments")
          .delete()
          .eq("subject_id", params.subject_id)
          .eq("class_id", params.class_id)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Sessions / Terms ──────────────────
    case "create_session": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("academic_sessions")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    case "create_term": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("academic_terms")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Assessment / Grading ───────────────
    case "create_assessment_component": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("assessment_components")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    case "create_grading_scale": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("grading_scales")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Psychomotor / Affective ────────────
    case "create_psychomotor_trait": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("psychomotor_definitions")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    case "create_affective_trait": {
      const createdId = (step.response_data as any)?.id;
      if (createdId) {
        await supabase
          .from("affective_definitions")
          .delete()
          .eq("id", createdId)
          .eq("school_id", schoolId);
      }
      return;
    }

    // ── Publishing ────────────────────────
    case "publish_results": {
      // Unpublish
      const params = step.input_params as Record<string, unknown> | null;
      if (params?.class_id && params?.term_id) {
        await supabase
          .from("term_results")
          .update({ published: false, published_at: null })
          .eq("school_id", schoolId)
          .eq("class_id", params.class_id)
          .eq("term_id", params.term_id);
      }
      return;
    }

    // ── Manual / Not Supported ────────────
    case "update_student":
    case "configure_report_card_settings":
    case "apply_assessment_template":
      throw new Error(
        `Rollback for "${step.capability}" requires manual intervention. ` +
        `Previous state was overridden and cannot be automatically restored.`,
      );

    default:
      throw new Error(
        `Rollback not implemented for "${step.capability}". ` +
        `This operation must be reversed manually.`,
      );
  }
}
