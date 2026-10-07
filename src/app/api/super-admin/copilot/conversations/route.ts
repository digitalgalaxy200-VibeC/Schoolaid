// ============================================================
// GET    /api/super-admin/copilot/conversations — paginated history
// DELETE /api/super-admin/copilot/conversations — delete one conversation
//
// GET also runs the chat retention sweep (lazily, on open): conversations that
// never executed anything are deleted after COPILOT_CHAT_RETENTION_HOURS of
// inactivity. Conversations that approved operations are never swept — they are
// the audit record of what the Copilot did (see deleteConversation).
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import {
  deleteConversation,
  listConversations,
  pruneStaleConversations,
} from "@/lib/copilot/session-manager";

/** Hours of inactivity after which a chat that executed nothing is deleted. */
const RETENTION_HOURS = Math.max(1, Number(process.env.COPILOT_CHAT_RETENTION_HOURS) || 24);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || undefined;
    const limit = Number(searchParams.get("limit")) || 20;
    const offset = Number(searchParams.get("offset")) || 0;

    const auth = await verifyCopilotAccess(request, schoolId || undefined);
    if (!auth.authorized) return auth.errorResponse!;

    // Lazy retention: plain chats do not accumulate forever. A failure here
    // must not break the list, so it is reported and swallowed.
    await pruneStaleConversations(RETENTION_HOURS).catch((err) => {
      console.error("[copilot] conversation sweep failed:", err);
    });

    const page = await listConversations(auth.schoolId ?? null, { limit, offset });
    return NextResponse.json({
      conversations: page.conversations,
      hasMore: page.hasMore,
      retentionHours: RETENTION_HOURS,
    });
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

    const auth = await verifyCopilotAccess(request, reqSchoolId || undefined);
    if (!auth.authorized) return auth.errorResponse!;

    const result = await deleteConversation(conversationId, auth.schoolId ?? null);
    if (result.deleted) return NextResponse.json({ success: true });

    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          "This chat approved operations, so it is kept as their audit record and cannot be deleted.",
      },
      { status: 409 },
    );
  } catch (err: any) {
    console.error("[copilot] delete conversation error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
