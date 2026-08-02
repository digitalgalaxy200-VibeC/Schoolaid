// ============================================================
// GET /api/super-admin/copilot/history
// Get message history for a conversation
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { getConversationHistory } from "@/lib/copilot/orchestrator";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const schoolId = searchParams.get("schoolId") || undefined;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyCopilotAccess(request, schoolId);
    if (!auth.authorized) return auth.errorResponse!;

    const messages = await getConversationHistory(conversationId, auth.schoolId!);

    if (messages === null) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(messages);
  } catch (err: any) {
    console.error("[copilot] history error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
