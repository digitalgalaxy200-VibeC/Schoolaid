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

  // The Super Admin's Stop button aborts the fetch, which fires this signal.
  // Forwarding it to the provider is what makes stopping real: without it the
  // model would keep generating a reply nobody will ever see. Best-effort by
  // nature — a hop that swallows the disconnect costs tokens, not correctness.
  const abortController = new AbortController();
  const forwardAbort = () => abortController.abort();
  request.signal.addEventListener("abort", forwardAbort);

  const stream = new ReadableStream({
    async start(controller) {
      // Sending to a client that has disconnected throws — and a stop is exactly
      // that. Writing through this helper keeps a dead socket from skipping the
      // bookkeeping below, where the part-registered reply is saved.
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // The reader is gone; there is nothing to tell it.
        }
      };

      try {
        // Send conversation ID first
        send({ type: "meta", conversationId: conversation.id });

        const streamMode = mode === "operations" ? "operations" : "read_only";

        for await (const result of streamChat(
          context,
          streamMode,
          chatHistory,
          message.trim(),
          abortController.signal,
        )) {
          if (result.chunk) {
            fullResponse += result.chunk;
            send({ type: "chunk", content: result.chunk });
          }

          if (result.plan) {
            send({ type: "plan", plan: result.plan });
          }

          if (result.reads && result.reads.length > 0) {
            // A read round: tell the panel what is being looked up, and leave an
            // audit trail — reads are still actions taken by the assistant.
            send({ type: "reading", capabilities: result.reads });
            await logAudit({
              schoolId: schoolId ?? null,
              superAdminId: userId,
              action: "read_round",
              details: { capabilities: result.reads },
            });
          }
        }

        // A stopped reply: save what the Super Admin actually saw, best effort,
        // so the history matches their screen — then leave a trace. No plan is
        // recorded, because a stopped reply never proposed one.
        if (abortController.signal.aborted) {
          if (fullResponse.trim()) {
            await addMessage(conversation.id, "assistant", fullResponse, false, null, null).catch(
              () => null,
            );
          }
          await logAudit({
            schoolId: schoolId ?? null,
            superAdminId: userId,
            action: "chat_stopped",
            details: { characters: fullResponse.length },
          });
          return;
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
        // A stop is not an error to report to a client that has gone away.
        if (!abortController.signal.aborted) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`),
            );
          } catch {
            // Same: nobody left to receive it.
          }
        }
      } finally {
        request.signal.removeEventListener("abort", forwardAbort);
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
