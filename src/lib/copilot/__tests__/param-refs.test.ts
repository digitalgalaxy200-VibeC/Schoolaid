import { describe, it, expect } from "vitest";
import { resolveRefs } from "../param-refs";
import { StepExecutionError, normalizeStepResult, type StepMeta } from "../step-result";
import type { StepResult } from "../types";

/**
 * P2 — parameter references. A dependent step can now consume an earlier
 * step's output, and a bad reference fails loudly instead of writing the
 * literal "$1.id" into the database.
 */

const meta = (over: Partial<StepMeta> = {}): StepMeta => ({
  capability: "create_class",
  tenantId: "school_123",
  requestId: "req_test",
  startedAtMs: 0,
  nowMs: () => 0,
  ...over,
});

const withStepOne = (): Map<number, StepResult> => {
  const results = new Map<number, StepResult>();
  results.set(
    1,
    normalizeStepResult({ id: "class_1", name: "Basic 1" }, meta({ capability: "create_class" })),
  );
  return results;
};

describe("resolveRefs", () => {
  it("replaces a whole-data reference", () => {
    expect(resolveRefs({ class_ref: "$1" }, withStepOne()).class_ref).toEqual({
      id: "class_1",
      name: "Basic 1",
    });
  });

  it("replaces a dotted-path reference", () => {
    const out = resolveRefs({ class_id: "$1.id" }, withStepOne());
    expect(out.class_id).toBe("class_1");
  });

  it("resolves nested objects and arrays", () => {
    const out = resolveRefs(
      { a: { b: "$1.name" }, list: ["$1.id", 5] },
      withStepOne(),
    );
    expect(out).toEqual({ a: { b: "Basic 1" }, list: ["class_1", 5] });
  });

  it("leaves ordinary strings and non-references untouched", () => {
    const out = resolveRefs({ name: "Basic 1", label: "step $1.name" }, withStepOne());
    expect(out.name).toBe("Basic 1");
    // Not a pure reference (has a prefix), so it is left as written.
    expect(out.label).toBe("step $1.name");
  });

  it("throws for a reference to a step with no result", () => {
    expect(() => resolveRefs({ x: "$9.id" }, withStepOne())).toThrow(StepExecutionError);
  });

  it("throws when the referenced step did not succeed", () => {
    const results = new Map<number, StepResult>();
    results.set(1, { ...normalizeStepResult({ id: "x" }, meta()), status: "unknown" });
    expect(() => resolveRefs({ x: "$1.id" }, results)).toThrow(/outcome was unknown/);
  });

  it("throws when the referenced path is missing", () => {
    expect(() => resolveRefs({ x: "$1.nope" }, withStepOne())).toThrow(StepExecutionError);
  });
});
