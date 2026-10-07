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
    // Super-admin level — fetch real school list
    const { data: allSchools } = await supabase
      .from("schools")
      .select("name, slug, subscription_status")
      .eq("is_archived", false)
      .order("name");

    return {
      schoolId: "",
      schoolName: "All Schools (Super Admin)",
      schoolSlug: "",
      userId,
      userEmail: "",
      userRole: "super_admin",
      impersonated: false,
      allSchools: (allSchools || []).map((s: any) => ({
        name: s.name,
        slug: s.slug,
        status: s.subscription_status,
      })),
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
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  const { data: activeTerm } = await supabase
    .from("academic_terms")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  // Fetch school stats for context
  const [{ count: studentCount }, { count: teacherCount }, { count: classCount }, { count: subjectCount }] =
    await Promise.all([
      supabase.from("students").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("teachers").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
      supabase.from("subjects").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    ]);

  return {
    schoolId,
    schoolName: school?.name || "Unknown School",
    schoolSlug: school?.slug || "",
    userId,
    userEmail: "",
    userRole: "super_admin",
    impersonated: false,
    activeSession: activeSession
      ? { id: activeSession.id, name: activeSession.name }
      : undefined,
    activeTerm: activeTerm
      ? { id: activeTerm.id, name: activeTerm.name }
      : undefined,
    schoolStats: {
      students: studentCount || 0,
      teachers: teacherCount || 0,
      classes: classCount || 0,
      subjects: subjectCount || 0,
    },
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

export type ConversationPage = {
  conversations: CopilotConversation[];
  hasMore: boolean;
};

/**
 * Lists conversations most-recently-active first.
 *
 * `schoolId: null` means the super-admin level (no school selected), whose
 * conversations carry a null school_id. One extra row beyond the page is
 * fetched so `hasMore` is answered honestly rather than guessed.
 */
export async function listConversations(
  schoolId: string | null,
  options: { limit?: number; offset?: number } = {},
): Promise<ConversationPage> {
  const supabase = getServiceClient();
  const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
  const offset = Math.max(0, options.offset ?? 0);

  let query = supabase
    .from("copilot_conversations")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit);

  query = schoolId ? query.eq("school_id", schoolId) : query.is("school_id", null);

  const { data } = await query;
  const rows = (data || []) as CopilotConversation[];
  return { conversations: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type DeleteConversationResult =
  | { deleted: true }
  | { deleted: false; reason: "not_found" | "has_operations" };

/**
 * Deletes a conversation and its messages.
 *
 * A conversation that carries approved operations is REFUSED, not cascaded.
 * `copilot_operations` cascades from the conversation, but `copilot_audit_log`
 * references operations and steps WITHOUT an ON DELETE clause — and the record
 * of what the Copilot executed must outlive the chat that asked for it. So the
 * guard is explicit: chats that did things are kept; chats that only talked can
 * be deleted.
 */
export async function deleteConversation(
  conversationId: string,
  schoolId: string | null,
): Promise<DeleteConversationResult> {
  const supabase = getServiceClient();

  let lookup = supabase.from("copilot_conversations").select("id").eq("id", conversationId);
  lookup = schoolId ? lookup.eq("school_id", schoolId) : lookup.is("school_id", null);
  const { data: conversation } = await lookup.maybeSingle();
  if (!conversation) return { deleted: false, reason: "not_found" };

  const { count } = await supabase
    .from("copilot_operations")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if ((count ?? 0) > 0) return { deleted: false, reason: "has_operations" };

  const { error } = await supabase.from("copilot_conversations").delete().eq("id", conversationId);
  if (error) throw new Error(`Could not delete the conversation: ${error.message}`);
  return { deleted: true };
}

/**
 * Retention sweep, run lazily when the history list is opened — the same
 * pattern the AI credits use, so no cron infrastructure is needed.
 *
 * Deletes conversations that never executed anything and have been idle beyond
 * the window; anything with operations is left as the audit record, and
 * conversations are never touched while they are still in use.
 */
export async function pruneStaleConversations(retentionHours: number): Promise<number> {
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("copilot_conversations")
    .select("id")
    .lt("updated_at", cutoff)
    .limit(100);

  let deleted = 0;
  for (const row of (data || []) as { id: string }[]) {
    const { count } = await supabase
      .from("copilot_operations")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", row.id);
    if ((count ?? 0) > 0) continue;

    const { error } = await supabase.from("copilot_conversations").delete().eq("id", row.id);
    if (!error) deleted++;
  }
  return deleted;
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
