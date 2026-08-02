// ============================================================
// POST /api/super-admin/copilot/stream
// Streaming chat — Server-Sent Events for real-time AI output.
// ============================================================

import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { buildContext, getOrCreateConversation, getMessages, addMessage } from "@/lib/copilot/session-manager";
import { streamChat } from "@/lib/copilot/agent-engine";

export async function POST(request: Request) {
  const body = await request.json();
  const { schoolId: reqSchoolId, conversationId, message, mode } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response("data: {\"error\":\"message is required\"}\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const auth = await verifyCopilotAccess(request, reqSchoolId);
  if (!auth.authorized) {
    return new Response(`data: {\"error\":\"${auth.errorResponse ? "Unauthorized" : "Unauthorized"}\"}\n\n`, {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const schoolId = auth.schoolId!;
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
        }

        // Save the full assistant response
        const plan = extractPlanFromContent(fullResponse);
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

// ── Plan Extraction (copied logic from agent-engine) ───────

function extractPlanFromContent(content: string) {
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
  const matches = [...content.matchAll(jsonBlockRegex)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.plan && Array.isArray(parsed.plan.steps)) {
        return parsed.plan;
      }
    } catch {}
  }
  return null;
}
