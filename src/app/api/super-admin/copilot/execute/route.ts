// ============================================================
// POST /api/super-admin/copilot/execute
// Approve and execute a pending execution plan.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { executePlan } from "@/lib/copilot/execution-engine";
import { getServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/copilot/audit-logger";
import type { ExecutionPlan } from "@/lib/copilot/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId: reqSchoolId, conversationId, messageId, plan, operationId } = body;

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return NextResponse.json(
        { error: "A valid execution plan with steps is required" },
        { status: 400 },
      );
    }

    // Auth
    const auth = await verifyCopilotAccess(request, reqSchoolId);
    if (!auth.authorized) return auth.errorResponse!;

    const schoolId = auth.schoolId!;
    const superAdminId = auth.userId!;

    // Log approval
    await logAudit({
      schoolId,
      superAdminId,
      action: "plan_approved",
      details: { conversationId, messageId, summary: (plan as ExecutionPlan).summary },
    });

    // Update the message plan_status to "approved"
    if (messageId) {
      const supabase = getServiceClient();
      await supabase
        .from("copilot_messages")
        .update({ plan_status: "executing" })
        .eq("id", messageId);
    }

    // Execute the plan
    const result = await executePlan(plan as ExecutionPlan, {
      schoolId,
      superAdminId,
      operationId: operationId || "",
    });

    // Update message plan_status
    if (messageId) {
      const supabase = getServiceClient();
      await supabase
        .from("copilot_messages")
        .update({
          plan_status: result.operation.status === "completed" ? "completed" : "failed",
        })
        .eq("id", messageId);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[copilot] execute error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
