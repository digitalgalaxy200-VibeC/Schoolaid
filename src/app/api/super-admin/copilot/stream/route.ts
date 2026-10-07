// ============================================================
// POST /api/super-admin/copilot/stream
// Streaming chat — Server-Sent Events for real-time AI output.
// ============================================================

import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { buildContext, getOrCreateConversation, getMessages, addMessage } from "@/lib/copilot/session-manager";
import { extractPlan, streamChat } from "@/lib/copilot/agent-engine";
import { logAudit } from "@/lib/copilot/audit-logger";

export async function POST(request: Request) {
  const body = await request.json();
  const { schoolId: reqSchoolId, conversationId, message, mode } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response("data: {\"error\":\"message is required\"}\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const auth = await verifyCopilotAccess(request, reqSchoolId || undefined);
  if (!auth.authorized) {
    return new Response(`data: {"error":"Unauthorized"}\n\n`, {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const schoolId = auth.schoolId || null;
  const userId = auth.userId!;

  // Build context and get/create conversation
  const context = await buildContext(schoolId, userId);
  const conversation = await getOrCreateConversation(schoolId, userId, conversationId);

  // Save user message
  await addMessage(conversation.id, "user", message.trim());

  // Load history for AI context
  const history = await getMessages(conversation.id);
  const chatHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Set up SSE stream
  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send conversation ID first
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "meta", conversationId: conversation.id })}\n\n`),
        );

        const streamMode = mode === "operations" ? "operations" : "read_only";

        for await (const result of streamChat(context, streamMode, chatHistory, message.trim())) {
          if (result.chunk) {
            fullResponse += result.chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: result.chunk })}\n\n`),
            );
          }

          if (result.plan) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "plan", plan: result.plan })}\n\n`),
            );
          }

          if (result.reads && result.reads.length > 0) {
            // A read round: tell the panel what is being looked up, and leave an
            // audit trail — reads are still actions taken by the assistant.
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "reading", capabilities: result.reads })}\n\n`,
              ),
            );
            await logAudit({
              schoolId: schoolId ?? null,
              superAdminId: userId,
              action: "read_round",
              details: { capabilities: result.reads },
            });
          }
        }

        // Save the full assistant response. The plan saved here is the SAME
        // normalized plan that was streamed to the client — one extractor, so
        // an approval from history and an approval from the live session see
        // the same steps.
        const plan = extractPlan(fullResponse, streamMode);
        const assistantMsg = await addMessage(
          conversation.id,
          "assistant",
          fullResponse,
          plan !== null,
          plan ? "pending" : null,
          plan || null,
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", messageId: assistantMsg.id })}\n\n`,
          ),
        );
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
