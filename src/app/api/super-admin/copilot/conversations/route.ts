// ============================================================
// GET  /api/super-admin/copilot/conversations — list conversations
// POST /api/super-admin/copilot/conversations — archive/delete
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { listConversations } from "@/lib/copilot/orchestrator";
import { archiveConversation } from "@/lib/copilot/session-manager";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || undefined;

    const auth = await verifyCopilotAccess(request, schoolId);
    if (!auth.authorized) return auth.errorResponse!;

    const conversations = await listConversations(auth.schoolId!);
    return NextResponse.json(conversations);
  } catch (err: any) {
    console.error("[copilot] list conversations error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { conversationId, schoolId: reqSchoolId } = body;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyCopilotAccess(request, reqSchoolId);
    if (!auth.authorized) return auth.errorResponse!;

    await archiveConversation(conversationId, auth.schoolId!);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[copilot] archive conversation error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
