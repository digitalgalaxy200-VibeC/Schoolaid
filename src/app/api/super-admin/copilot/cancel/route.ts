// ============================================================
// POST /api/super-admin/copilot/cancel
// Cancel a pending execution plan.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { getServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/copilot/audit-logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId: reqSchoolId, messageId } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyCopilotAccess(request, reqSchoolId);
    if (!auth.authorized) return auth.errorResponse!;

    // Update message plan_status
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("copilot_messages")
      .update({ plan_status: "cancelled" })
      .eq("id", messageId);

    if (error) {
      return NextResponse.json(
        { error: `Failed to cancel plan: ${error.message}` },
        { status: 500 },
      );
    }

    await logAudit({
      schoolId: auth.schoolId!,
      superAdminId: auth.userId!,
      action: "plan_cancelled",
      details: { messageId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[copilot] cancel error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
