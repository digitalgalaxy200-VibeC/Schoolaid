// ============================================================
// Orchestrator — main entry point for the copilot module.
// Coordinates session management, AI agent, and execution.
// ============================================================

import type { CopilotContext, CopilotMessage, ExecutionPlan, ChatResponse } from "./types";
import { buildContext, getOrCreateConversation, getMessages, addMessage } from "./session-manager";
import { chat as agentChat, validatePlan } from "./agent-engine";

// ── Send Message ───────────────────────────────────────────

export async function handleChat(request: {
  schoolId: string | null;
  userId: string;
  conversationId?: string;
  message: string;
  mode?: "read_only" | "operations";
}): Promise<ChatResponse> {
  const { schoolId, userId, conversationId, message, mode = "read_only" } = request;

  // 1. Build context
  const context = await buildContext(schoolId, userId);

  // 2. Get or create conversation
  const conversation = await getOrCreateConversation(schoolId, userId, conversationId);

  // 3. Load message history
  const history = await getMessages(conversation.id);

  // 4. Save user message
  const userMsg = await addMessage(conversation.id, "user", message);

  // 5. Build history for AI (exclude system messages)
  const chatHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // 6. Call AI
  const { response, plan } = await agentChat(context, mode, chatHistory, message);

  // 7. Save AI response
  const assistantMsg = await addMessage(
    conversation.id,
    "assistant",
    response,
    plan !== null,
    plan ? "pending" : null,
    plan || null,
  );

  return {
    conversationId: conversation.id,
    message: assistantMsg,
    plan: plan || undefined,
  };
}

// ── Get Conversation History ───────────────────────────────

export async function getConversationHistory(conversationId: string, schoolId: string) {
  const supabase = (await import("@/lib/supabase/service")).getServiceClient();

  // Verify the conversation belongs to this school
  const { data: conv } = await supabase
    .from("copilot_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("school_id", schoolId)
    .single();

  if (!conv) return null;

  return getMessages(conversationId);
}

// ── List Conversations ─────────────────────────────────────

export async function listConversations(schoolId: string) {
  const { listConversations: list } = await import("./session-manager");
  return list(schoolId);
}

// ── Validate a Plan (without executing) ────────────────────

export function validateExecutionPlan(plan: ExecutionPlan) {
  return validatePlan(plan);
}
