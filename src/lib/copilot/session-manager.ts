// ============================================================
// Session Manager — manages copilot conversations, messages,
// and context assembly for the current school/user session.
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";
import type {
  CopilotContext,
  CopilotConversation,
  CopilotMessage,
} from "./types";

// ── Context Assembly ───────────────────────────────────────

export async function buildContext(
  schoolId: string | null,
  userId: string,
): Promise<CopilotContext> {
  const supabase = getServiceClient();

  if (!schoolId) {
    // Super-admin level — no specific school
    return {
      schoolId: "",
      schoolName: "All Schools (Super Admin)",
      schoolSlug: "",
      userId,
      userEmail: "",
      userRole: "super_admin",
      impersonated: false,
    };
  }

  // Fetch school info
  const { data: school } = await supabase
    .from("schools")
    .select("name, slug")
    .eq("id", schoolId)
    .single();

  // Fetch active session and term
  const { data: activeSession } = await supabase
    .from("academic_sessions")
    .select("id, session_name")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  const { data: activeTerm } = await supabase
    .from("academic_terms")
    .select("id, term_name")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  return {
    schoolId,
    schoolName: school?.name || "Unknown School",
    schoolSlug: school?.slug || "",
    userId,
    userEmail: "",
    userRole: "super_admin",
    impersonated: false,
    activeSession: activeSession
      ? { id: activeSession.id, name: activeSession.session_name }
      : undefined,
    activeTerm: activeTerm
      ? { id: activeTerm.id, name: activeTerm.term_name }
      : undefined,
  };
}

// ── Conversation CRUD ──────────────────────────────────────

export async function getOrCreateConversation(
  schoolId: string | null,
  superAdminId: string,
  conversationId?: string,
): Promise<CopilotConversation> {
  const supabase = getServiceClient();

  if (conversationId) {
    const query = supabase
      .from("copilot_conversations")
      .select("*")
      .eq("id", conversationId);

    // Scope to school if provided, otherwise allow null school_id (super-admin)
    if (schoolId) {
      query.eq("school_id", schoolId);
    }

    const { data } = await query.single();
    if (data) return data as CopilotConversation;
  }

  // Create a new conversation — null school_id for super-admin level
  const { data, error } = await supabase
    .from("copilot_conversations")
    .insert({
      school_id: schoolId || null,
      super_admin_id: superAdminId,
      mode: "read_only",
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data as CopilotConversation;
}

export async function listConversations(
  schoolId: string,
): Promise<CopilotConversation[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("copilot_conversations")
    .select("*")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);

  return (data || []) as CopilotConversation[];
}

export async function archiveConversation(
  conversationId: string,
  schoolId: string,
): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from("copilot_conversations")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("school_id", schoolId);
}

// ── Message CRUD ───────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  limit = 50,
): Promise<CopilotMessage[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("copilot_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data || []) as CopilotMessage[];
}

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  hasPlan = false,
  planStatus: CopilotMessage["plan_status"] = null,
  planSummary: unknown = null,
): Promise<CopilotMessage> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("copilot_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      has_plan: hasPlan,
      plan_status: planStatus,
      plan_summary: planSummary,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to add message: ${error.message}`);

  // Update conversation timestamp and title (from first user message)
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (role === "user") {
    // Auto-generate title from first user message
    const { data: conv } = await supabase
      .from("copilot_conversations")
      .select("title")
      .eq("id", conversationId)
      .single();

    if (conv && !conv.title) {
      updates.title = content.slice(0, 80) + (content.length > 80 ? "..." : "");
    }
  }

  await supabase
    .from("copilot_conversations")
    .update(updates)
    .eq("id", conversationId);

  return data as CopilotMessage;
}

// ── Conversation Mode ──────────────────────────────────────

export async function setConversationMode(
  conversationId: string,
  mode: "read_only" | "operations",
): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from("copilot_conversations")
    .update({ mode, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
