import { describe, it, expect } from "vitest";
import { MAX_READS_PER_ROUND, MAX_TOTAL_READS_PER_TURN, extractReads, validateReads } from "../read-protocol";

/**
 * The copilot must be able to FETCH data itself. A read request the parser does
 * not recognise is a read that never happens, after which the model can end up
 * asking the operator to paste data they never had. These pin the formats the
 * model actually emits, not just the one the prompt asks for.
 */

const reads = {
  reads: [{ capability: "get_website_content", params: { kind: "hero" } }],
};

describe("extractReads — tolerant of how the request is fenced", () => {
  it("accepts an untagged fence", () => {
    expect(extractReads(`Pulling shapes:\n\`\`\`\n${JSON.stringify(reads)}\n\`\`\``)).toEqual([
      { capability: "get_website_content", params: { kind: "hero" } },
    ]);
  });

  it("accepts an uppercase JSON tag", () => {
    expect(extractReads(`\`\`\`JSON\n${JSON.stringify(reads)}\n\`\`\``)).toHaveLength(1);
  });

  it("accepts a bare reads object inside prose", () => {
    expect(
      extractReads(`Reading them now ${JSON.stringify(reads)} and then answering.`),
    ).toEqual([{ capability: "get_website_content", params: { kind: "hero" } }]);
  });

  it("does not mistake an execution plan for a read request", () => {
    const plan = { plan: { summary: "x", steps: [] } };
    expect(extractReads(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)).toEqual([]);
  });

  it("returns nothing for an unterminated bare object", () => {
    expect(extractReads('Here: {"reads":[{"capability":"list_classes"}')).toEqual([]);
  });

  it("returns nothing when there is no request at all", () => {
    expect(extractReads("I will fetch that shortly.")).toEqual([]);
  });
});

describe("read budget", () => {
  it("caps a whole turn above a single round", () => {
    expect(MAX_TOTAL_READS_PER_TURN).toBeGreaterThan(MAX_READS_PER_ROUND);
  });

  it("refuses every read once the budget is spent", () => {
    const { valid, refused } = validateReads(
      [{ capability: "list_classes", params: {} }],
      0,
    );
    expect(valid).toEqual([]);
    expect(refused).toEqual(["list_classes"]);
  });
});
