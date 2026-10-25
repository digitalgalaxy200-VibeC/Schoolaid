import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase } from "@/lib/ai/__tests__/fake-supabase";
import type { CopilotContext } from "../types";

/**
 * Context assembly — the two bugs that made Gwin look like it had amnesia.
 *
 * 1. The user's message was saved and then reloaded into history, and
 *    `buildMessages` appended it again: every turn carried it twice.
 * 2. History loaded the OLDEST 50 messages, so past that point the model never
 *    saw a recent turn at all.
 *
 * These are quiet failures — nothing throws, the reply is simply worse — so they
 * are pinned here rather than left to a manual pass.
 */

const state = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => state.client as SupabaseClient,
}));

import { buildMessages } from "../agent-engine";
import { getMessages, getMessagesForPrompt } from "../session-manager";

const context: CopilotContext = {
  schoolId: "11111111-1111-1111-1111-111111111111",
  schoolName: "Test School",
  schoolSlug: "test-school",
  userId: "user-1",
  userEmail: "",
  userRole: "super_admin",
  impersonated: false,
};

describe("buildMessages — the new message is included once", () => {
  it("does not repeat the message when history excludes it", () => {
    const messages = buildMessages(
      context,
      "operations",
      [
        { role: "user", content: "create Basic 1" },
        { role: "assistant", content: "Here is the plan." },
      ],
      "do it",
    );

    const sent = messages.filter((m) => m.content === "do it");
    expect(sent, "the current message must appear exactly once").toHaveLength(1);
    // And it must be last, so the model reads it as the current turn.
    expect(messages[messages.length - 1]!.content).toBe("do it");
  });

  it("keeps two identical consecutive messages — a repeated sentence is real", () => {
    // A de-dupe based on equality would silently delete one of these.
    const messages = buildMessages(
      context,
      "operations",
      [
        { role: "user", content: "again" },
        { role: "assistant", content: "Done." },
      ],
      "again",
    );

    expect(messages.filter((m) => m.content === "again")).toHaveLength(2);
  });
});

describe("getMessagesForPrompt — the newest window, oldest-first", () => {
  it("asks the database for the newest rows, with a stable tie-breaker", async () => {
    const fake = fakeSupabase({ select: () => ({ data: [], error: null }) });
    state.client = fake.client;

    await getMessagesForPrompt("conversation-1");

    expect(fake.selects[0]!.orders).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(fake.selects[0]!.filters).toContainEqual(["conversation_id", "conversation-1"]);
  });

  it("returns them oldest-first, so a same-millisecond pair keeps its order", async () => {
    // The database returns newest-first; these two rows share a timestamp, which
    // is why `id` is the tie-breaker. Input order is what the fake returned.
    const rows = [
      { id: "b", role: "assistant", content: "second", created_at: "2026-01-01T00:00:00.001Z" },
      { id: "a", role: "user", content: "first", created_at: "2026-01-01T00:00:00.001Z" },
    ];
    const fake = fakeSupabase({ select: () => ({ data: rows, error: null }) });
    state.client = fake.client;

    const out = await getMessagesForPrompt("conversation-1");
    expect(out.map((m) => m.content)).toEqual(["first", "second"]);
  });
});

describe("getMessages — the display reader is left alone", () => {
  it("still reads oldest-first for the panel", async () => {
    // Prompt assembly and history display are deliberately separate: changing
    // this one would silently truncate the earliest messages a user can see.
    const fake = fakeSupabase({ select: () => ({ data: [], error: null }) });
    state.client = fake.client;

    await getMessages("conversation-1");

    expect(fake.selects[0]!.orders).toEqual([["created_at", { ascending: true }]]);
  });
});
