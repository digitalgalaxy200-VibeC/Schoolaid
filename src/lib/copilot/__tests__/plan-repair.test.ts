import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CopilotContext } from "../types";
import type { StreamEvent } from "../agent-engine";

/**
 * Plan repair — the fix for the loop that wasted the most time.
 *
 * When the model described a change but wrote no parseable plan, `extractPlan`
 * returned null, the panel had no card, and the operator's only move was to say
 * "yes" and wait for a second reply. Now one plan-only follow-up runs, which
 * emits no chunks: still one bubble and one plan card.
 */

const provider = vi.hoisted(() => ({
  streamChat: vi.fn(),
  chat: vi.fn(),
}));

vi.mock("../providers", () => ({ getAIProvider: () => provider }));

import { looksLikeChangeRequest, streamChat } from "../agent-engine";

const context: CopilotContext = {
  schoolId: "11111111-1111-1111-1111-111111111111",
  schoolName: "Test School",
  schoolSlug: "test-school",
  userId: "user-1",
  userEmail: "",
  userRole: "super_admin",
  impersonated: false,
};

const PLAN_JSON = JSON.stringify({
  plan: {
    summary: "Create six classes",
    steps: [
      {
        order: 1,
        capability: "create_class",
        description: "Create Basic 1",
        params: { name: "Basic 1" },
      },
    ],
  },
});

async function stream(mode: "read_only" | "operations", message: string): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of streamChat(context, mode, [], message)) events.push(event);
  return events;
}

beforeEach(() => {
  provider.streamChat.mockReset();
  provider.chat.mockReset();
});

describe("streamChat — plan repair", () => {
  it("asks once for a plan when a change request produced no parseable one", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield "I'll create all six classes for you.";
    });
    provider.chat.mockResolvedValue({ content: PLAN_JSON });

    const events = await stream("operations", "create classes Basic 1 through Basic 6");
    const final = events[events.length - 1]!;

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(final.plan?.steps[0]?.capability).toBe("create_class");
    // JSON mode is what makes the second call reliable; the first call keeps prose.
    expect(provider.chat.mock.calls[0]![1]).toMatchObject({ responseFormat: "json_object" });
  });

  it("does not repair when the prose already carried a plan", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield `Creating them now.\n\n\`\`\`json\n${PLAN_JSON}\n\`\`\``;
    });

    const events = await stream("operations", "create classes Basic 1 through Basic 6");
    const final = events[events.length - 1]!;

    expect(provider.chat).not.toHaveBeenCalled();
    expect(final.plan).not.toBeNull();
  });

  it("never repairs in Read-Only mode — a plan there could not run anyway", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield "I would create them, but this panel is in Read-Only mode.";
    });

    const events = await stream("read_only", "create classes Basic 1 through Basic 6");
    const final = events[events.length - 1]!;

    expect(provider.chat).not.toHaveBeenCalled();
    expect(final.plan).toBeNull();
  });

  it("does not repair a question", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield "This school has 612 students.";
    });

    const events = await stream("operations", "how many students do we have?");
    const final = events[events.length - 1]!;

    expect(provider.chat).not.toHaveBeenCalled();
    expect(final.plan).toBeNull();
  });

  it("survives a failed repair without losing the answer the operator already read", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield "I'll create all six classes for you.";
    });
    provider.chat.mockRejectedValue(new Error("upstream down"));

    const events = await stream("operations", "create classes Basic 1 through Basic 6");

    expect(events.some((e) => e.chunk.includes("six classes"))).toBe(true);
    expect(events[events.length - 1]!.plan).toBeNull();
  });

  it("adds no chunks of its own, so only one bubble and one card appear", async () => {
    provider.streamChat.mockImplementation(async function* () {
      yield "I'll create all six classes for you.";
    });
    provider.chat.mockResolvedValue({ content: PLAN_JSON });

    const events = await stream("operations", "create classes Basic 1 through Basic 6");
    const planEvents = events.filter((e) => e.plan !== null);

    expect(planEvents).toHaveLength(1);
    // The follow-up contributes zero streamed content.
    expect(events.map((e) => e.chunk).join("")).toBe("I'll create all six classes for you.");
  });
});

describe("looksLikeChangeRequest", () => {
  it("recognises an instruction", () => {
    for (const message of [
      "create classes Basic 1 through Basic 6",
      "update the principal's message",
      "fill the gallery with these photos",
      "turn off the notice bar",
    ]) {
      expect(looksLikeChangeRequest(message), message).toBe(true);
    }
  });

  it("does not mistake a question about how something works for an instruction", () => {
    for (const message of [
      "how many students do we have?",
      "how do I create a class?",
      "why can't this school generate report cards?",
      "what subjects are assigned to Basic 1?",
    ]) {
      expect(looksLikeChangeRequest(message), message).toBe(false);
    }
  });
});
