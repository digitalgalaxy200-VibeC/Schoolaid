import { describe, it, expect, vi } from "vitest";

/**
 * The Super Admin should not read our thinking.
 *
 * A reply that requests data used to arrive as "Good question — let me look at
 * the actual records…" followed by the read block, which the panel rendered as
 * a paragraph before the answer. That paragraph is narration, not an answer, and
 * it was also saved into the conversation.
 *
 * Two layers keep it out:
 *   - a read block that IS the reply is held back and never streamed at all;
 *   - anything streamed before a confirmed read round is discarded by the route
 *     (the panel clears it), which covers a model that talks first anyway.
 */

const state = vi.hoisted(() => ({
  rounds: [] as string[][],
  round: 0,
  providerCalls: 0,
}));

vi.mock("../providers", () => ({
  getAIProvider: () => ({
    chat: async () => ({ content: "", model: "fake" }),
    streamChat: async function* (): AsyncGenerator<string> {
      const chunks = state.rounds[state.round] ?? [""];
      state.round++;
      state.providerCalls++;
      for (const chunk of chunks) yield chunk;
    },
  }),
}));

vi.mock("../execution-engine", () => ({
  executeReadCapability: async () => ({ read: true }),
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

/** The read request, split exactly as a provider streams it. */
const BLOCK_CHUNKS = [
  "```json\n",
  '{"reads":[{"capability":"list_classes","params":{}}]}',
  "\n```",
];

const reset = (rounds: string[][]) => {
  state.rounds = rounds;
  state.round = 0;
  state.providerCalls = 0;
};

async function collect(question: string) {
  let text = "";
  const reads: string[][] = [];
  for await (const event of streamChat(context, "read_only", [], question)) {
    text += event.chunk;
    if (event.reads) reads.push(event.reads);
  }
  return { text, reads };
}

describe("streamChat — a read request is not prose", () => {
  it("streams nothing for a read block, then streams the answer", async () => {
    reset([BLOCK_CHUNKS, ["You have 12 ", "classes."]]);

    const { text, reads } = await collect("how many classes?");

    expect(reads).toEqual([["list_classes"]]);
    // The block itself is machine input: not one character of it is shown.
    expect(text).toBe("You have 12 classes.");
  });

  it("streams a bare object read request silently too", async () => {
    reset([[JSON.stringify({ reads: [{ capability: "list_classes", params: {} }] })], ["Twelve."]]);

    const { text, reads } = await collect("how many classes?");

    expect(reads).toEqual([["list_classes"]]);
    expect(text).toBe("Twelve.");
  });

  it("still streams an answer that is not asking for anything", async () => {
    reset([["Twelve ", "classes ", "this term."]]);

    const { text, reads } = await collect("how many classes?");

    expect(reads).toEqual([]);
    expect(text).toBe("Twelve classes this term.");
  });

  it("streams a preamble written before a read block — the route discards it", async () => {
    // The engine cannot retract text it has already yielded, so this documents
    // the contract: the route clears the reply when the `reads` event arrives.
    reset([["Let me check.", "\n\n", ...BLOCK_CHUNKS], ["Twelve."]]);

    const { text, reads } = await collect("how many classes?");

    expect(text.startsWith("Let me check.")).toBe(true);
    expect(reads).toEqual([["list_classes"]]);
  });
});
