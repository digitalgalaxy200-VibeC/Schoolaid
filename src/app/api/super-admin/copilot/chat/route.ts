// ============================================================
// POST /api/super-admin/copilot/chat
// Send a message to Gwin and get a response.
// The AI may return an execution plan for review.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { handleChat } from "@/lib/copilot/orchestrator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId: reqSchoolId, conversationId, message, mode } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    // Auth — schoolId is optional (super-admin level operations allowed)
    const auth = await verifyCopilotAccess(request, reqSchoolId || undefined);
    if (!auth.authorized) return auth.errorResponse!;

    // Process
    const result = await handleChat({
      schoolId: auth.schoolId || null,
      userId: auth.userId!,
      conversationId: conversationId || undefined,
      message: message.trim(),
      mode: mode === "operations" ? "operations" : "read_only",
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[copilot] chat error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
