import { describe, it, expect } from "vitest";
import { extractReads, renderReadResults, validateReads } from "../read-protocol";

/**
 * The read-round protocol: a model reply may ask for data with a fenced
 * {"reads":[...]} block. These tests pin the two things that matter — the
 * request is never trusted (only registry read-only capabilities survive), and
 * the results are fenced like every other untrusted value before the model
 * sees them again.
 */

describe("extractReads", () => {
  const block = (json: unknown) => `Here goes.\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\``;

  it("parses a reads block", () => {
    const reads = extractReads(
      block({ reads: [{ capability: "list_classes", params: { class_id: "c-1" } }] }),
    );
    expect(reads).toEqual([{ capability: "list_classes", params: { class_id: "c-1" } }]);
  });

  it("returns nothing for a plan block", () => {
    expect(extractReads(block({ plan: { summary: "x", steps: [] } }))).toEqual([]);
  });

  it("skips malformed entries and defaults params to an object", () => {
    const reads = extractReads(
      block({ reads: [{ capability: "list_classes" }, { nope: true }, "string-entry"] }),
    );
    expect(reads).toEqual([{ capability: "list_classes", params: {} }]);
  });

  it("finds a reads block that follows another JSON block", () => {
    const content = `${block({ note: "not a reads block" })}\nAnd now:\n${block({ reads: [{ capability: "list_teachers" }] })}`;
    expect(extractReads(content)).toEqual([{ capability: "list_teachers", params: {} }]);
  });

  it("returns nothing when there is no block", () => {
    expect(extractReads("Just prose.")).toEqual([]);
  });
});

describe("validateReads", () => {
  it("keeps known read-only capabilities", () => {
    const { valid, refused } = validateReads([
      { capability: "list_classes", params: {} },
      { capability: "list_students", params: {} },
    ]);
    expect(valid.map((r) => r.capability)).toEqual(["list_classes", "list_students"]);
    expect(refused).toEqual([]);
  });

  it("refuses unknown capabilities", () => {
    const { valid, refused } = validateReads([{ capability: "make_magic", params: {} }]);
    expect(valid).toEqual([]);
    expect(refused).toEqual(["make_magic"]);
  });

  it("refuses write capabilities — a read round can never write", () => {
    const { valid, refused } = validateReads([
      { capability: "create_class", params: { name: "Basic 1" } },
      { capability: "create_student", params: {} },
    ]);
    expect(valid).toEqual([]);
    expect(refused).toEqual(["create_class", "create_student"]);
  });

  it("caps the reads per round", () => {
    const many = Array.from({ length: 7 }, () => ({ capability: "list_classes", params: {} }));
    const { valid, refused } = validateReads(many);
    expect(valid).toHaveLength(5);
    expect(refused).toHaveLength(2);
  });
});

describe("renderReadResults", () => {
  it("fences each result as untrusted data", () => {
    const text = renderReadResults([{ capability: "list_classes", data: [{ name: "Basic 1" }] }]);
    expect(text).toMatch(/BEGIN UNTRUSTED/);
    expect(text).toMatch(/END UNTRUSTED/);
    expect(text).toContain("Basic 1");
  });

  it("reports a failed read without pretending it succeeded", () => {
    const text = renderReadResults([{ capability: "list_classes", error: "Query failed: boom" }]);
    expect(text).toContain("ERROR: Query failed: boom");
  });

  it("truncates an oversized payload instead of flooding the model", () => {
    const text = renderReadResults([{ capability: "list_students", data: "x".repeat(20000) }]);
    expect(text).toContain("[truncated");
    expect(text.length).toBeLessThan(20000);
  });
});
