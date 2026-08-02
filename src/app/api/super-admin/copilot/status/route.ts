// ============================================================
// GET /api/super-admin/copilot/status
// Get live operation progress for an active or completed operation.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { getServiceClient } from "@/lib/supabase/service";
import type { OperationStatus } from "@/lib/copilot/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operationId = searchParams.get("operationId");
    const schoolId = searchParams.get("schoolId") || undefined;

    if (!operationId) {
      return NextResponse.json(
        { error: "operationId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyCopilotAccess(request, schoolId);
    if (!auth.authorized) return auth.errorResponse!;

    const supabase = getServiceClient();

    // Get operation
    const { data: operation } = await supabase
      .from("copilot_operations")
      .select("*")
      .eq("id", operationId)
      .eq("school_id", auth.schoolId!)
      .single();

    if (!operation) {
      return NextResponse.json(
        { error: "Operation not found" },
        { status: 404 },
      );
    }

    // Get steps
    const { data: steps } = await supabase
      .from("copilot_operation_steps")
      .select("*")
      .eq("operation_id", operationId)
      .order("step_order");

    const status: OperationStatus = {
      operation: operation,
      steps: (steps || []) as OperationStatus["steps"],
    };

    return NextResponse.json(status);
  } catch (err: any) {
    console.error("[copilot] status error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
