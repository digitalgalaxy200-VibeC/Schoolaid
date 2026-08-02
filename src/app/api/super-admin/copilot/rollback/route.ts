// ============================================================
// POST /api/super-admin/copilot/rollback
// Undo a completed or partially-failed operation.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { rollbackOperation } from "@/lib/copilot/rollback-manager";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId: reqSchoolId, operationId } = body;

    if (!operationId) {
      return NextResponse.json(
        { error: "operationId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyCopilotAccess(request, reqSchoolId);
    if (!auth.authorized) return auth.errorResponse!;

    const result = await rollbackOperation(
      operationId,
      auth.schoolId!,
      auth.userId!,
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[copilot] rollback error:", err);

    const status = err.message.includes("not found")
      ? 404
      : err.message.includes("already been rolled back") ||
        err.message.includes("Cannot rollback")
      ? 400
      : 500;

    return NextResponse.json({ error: err.message }, { status });
  }
}
