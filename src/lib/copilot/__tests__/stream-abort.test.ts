import { describe, it, expect, vi } from "vitest";

/**
 * "Stop" has to mean stop. These tests drive the real `streamChat` against a
 * fake provider and check the three places a reply can outlive the person
 * reading it: mid-sentence, at a read round, and at plan extraction. A plan
 * extracted from a half-written reply would be an invitation to execute
 * something nobody finished writing — so a stopped reply must never offer one.
 */

const state = vi.hoisted(() => ({
  chunks: [] as string[],
  providerCalls: 0,
}));

vi.mock("../providers", () => ({
  getAIProvider: () => ({
    chat: async () => ({ content: "", model: "fake" }),
    streamChat: async function* (
      _messages: unknown,
      options?: { signal?: AbortSignal },
    ): AsyncGenerator<string> {
      state.providerCalls++;
      for (const chunk of state.chunks) {
        if (options?.signal?.aborted) return;
        yield chunk;
      }
    },
  }),
}));

import { streamChat } from "../agent-engine";
import type { CopilotContext } from "../types";

const context: CopilotContext = {
  schoolId: "11111111-1111-4111-8111-111111111111",
  schoolName: "Eagles Academy",
  schoolSlug: "eagles",
  userId: "22222222-2222-4222-8222-222222222222",
  userEmail: "admin@schoolaid.online",
  userRole: "super_admin",
  impersonated: false,
};

const READS_BLOCK = 'Let me check.\n\n```json\n{"reads":[{"capability":"list_classes","params":{}}]}\n```';

const PLAN_BLOCK =
  '\n\n```json\n{"plan":{"summary":"Create a class","steps":[{"order":1,"capability":"create_class","description":"Create Primary 1","params":{"name":"Primary 1"}}]}}\n```';

describe("streamChat — the Stop button", () => {
  it("stops mid-reply and says nothing more", async () => {
    state.chunks = ["Hello ", "there, ", "this is a long reply."];
    state.providerCalls = 0;

    const controller = new AbortController();
    const seen: string[] = [];
    for await (const event of streamChat(context, "read_only", [], "hi", controller.signal)) {
      if (event.chunk) {
        seen.push(event.chunk);
        controller.abort(); // the Stop button, pressed as the first words arrive
      }
    }

    expect(seen).toEqual(["Hello "]);
  });

  it("does not start a read round after a stop", async () => {
    state.chunks = [READS_BLOCK];
    state.providerCalls = 0;

    const controller = new AbortController();
    const reads: string[][] = [];
    for await (const event of streamChat(context, "read_only", [], "how many classes?", controller.signal)) {
      if (event.chunk) controller.abort();
      if (event.reads) reads.push(event.reads);
    }

    expect(reads).toEqual([]);
    // One round only: the lookup — and the model turn that would follow it —
    // never happened. (Without the abort it would have tried to query.)
    expect(state.providerCalls).toBe(1);
  });

  it("yields nothing at all for a signal that was already aborted", async () => {
    state.chunks = ["should never be read"];
    state.providerCalls = 0;

    const controller = new AbortController();
    controller.abort();

    const events = [];
    for await (const event of streamChat(context, "operations", [], "hi", controller.signal)) {
      events.push(event);
    }

    expect(events).toEqual([]);
    expect(state.providerCalls).toBe(0);
  });

  it("never offers a plan from a stopped reply", async () => {
    state.chunks = ["Here is the plan.", PLAN_BLOCK];
    state.providerCalls = 0;

    const controller = new AbortController();
    const plans: unknown[] = [];
    for await (const event of streamChat(context, "operations", [], "create a class", controller.signal)) {
      if (event.chunk) controller.abort();
      if (event.plan) plans.push(event.plan);
    }

    expect(plans).toEqual([]);
  });

  it("still streams to the end, and offers the plan, when nobody stops it", async () => {
    // The regression guard for the four tests above: without a signal the reply
    // is unchanged — every chunk arrives and the plan is extracted as before.
    state.chunks = ["Here is the plan.", PLAN_BLOCK];
    state.providerCalls = 0;

    let text = "";
    const plans: { summary?: string }[] = [];
    for await (const event of streamChat(context, "operations", [], "create a class")) {
      text += event.chunk;
      if (event.plan) plans.push(event.plan as { summary?: string });
    }

    expect(text).toContain("Here is the plan.");
    expect(text).toContain('"plan"');
    expect(plans).toHaveLength(1);
    expect(plans[0].summary).toBe("Create a class");
  });
});
