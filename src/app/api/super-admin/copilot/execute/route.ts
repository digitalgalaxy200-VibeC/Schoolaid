// ============================================================
// POST /api/super-admin/copilot/execute
// Approve and execute a pending execution plan.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { executePlan } from "@/lib/copilot/execution-engine";
import { validatePlan } from "@/lib/copilot/agent-engine";
import { explainPlanRefusal } from "@/lib/copilot/plan-refusal";
import { checkPlanPayload } from "@/lib/copilot/limits";
import { getServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/copilot/audit-logger";
import {
  planStatusForOperation,
  settleInterruptedExecution,
} from "@/lib/copilot/plan-reconciliation";
import type { ExecutionPlan } from "@/lib/copilot/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId: reqSchoolId, conversationId, messageId, plan, operationId } = body;

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return NextResponse.json(
        { error: "A valid execution plan with steps is required", code: "INVALID_PLAN" },
        { status: 400 },
      );
    }

    // Refuse an oversized plan explicitly, before anything runs. A plan cut off
    // in transport is a DIFFERENT plan, not a smaller one — so it is rejected,
    // never silently truncated.
    const payload = checkPlanPayload(plan);
    if (!payload.ok) {
      return NextResponse.json(
        {
          error: "Request exceeds the maximum execution payload size.",
          code: "PAYLOAD_TOO_LARGE",
          max_bytes: payload.maxBytes,
          received_bytes: payload.bytes,
        },
        { status: 413 },
      );
    }

    // Auth
    const auth = await verifyCopilotAccess(request, reqSchoolId);
    if (!auth.authorized) return auth.errorResponse!;

    // A plan is only executable if it is valid: known capabilities, every
    // required param present, and no write step inside a Read-Only plan. This
    // used to be prompt-only enforcement; it is a code gate now.
    //
    // The refusal carries its reason: "cannot execute" with the real cause left
    // in `details` is a dead end for the person reading it.
    const validation = validatePlan(plan as ExecutionPlan);
    if (!validation.valid) {
      return NextResponse.json(
        { error: explainPlanRefusal(validation.errors), details: validation.errors },
        { status: 400 },
      );
    }

    const schoolId = auth.schoolId!;
    const superAdminId = auth.userId!;

    // Log approval
    await logAudit({
      schoolId,
      superAdminId,
      action: "plan_approved",
      details: { conversationId, messageId, summary: (plan as ExecutionPlan).summary },
    });

    const supabase = getServiceClient();

    // The message status must survive the call. If the write is lost, history
    // reconciliation repairs it from `copilot_operations` — but a write failure
    // is still worth logging, because it delays the repair until the next read.
    const setPlanStatus = async (status: string) => {
      if (!messageId) return;
      const { error } = await supabase
        .from("copilot_messages")
        .update({ plan_status: status })
        .eq("id", messageId);
      if (error) {
        console.error(
          `[copilot] could not write plan_status=${status} for ${messageId}:`,
          error.message,
        );
      }
    };

    await setPlanStatus("executing");

    // Execute the plan. An approval already happened, so a throw must not leave
    // the message as an approvable `pending` plan.
    let result;
    try {
      result = await executePlan(plan as ExecutionPlan, {
        schoolId: schoolId || "",
        superAdminId,
        operationId: operationId || "",
        conversationId: conversationId || undefined,
        messageId: messageId || undefined,
      });
    } catch (err: any) {
      await settleInterruptedExecution({
        messageId,
        schoolId,
        superAdminId,
        reason: err?.message || "Execution failed",
      });
      throw err;
    }

    await setPlanStatus(planStatusForOperation(result.operation.status) ?? "failed");

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[copilot] execute error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
