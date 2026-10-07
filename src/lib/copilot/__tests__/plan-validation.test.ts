import { describe, it, expect } from "vitest";
import { validatePlan, extractPlan } from "../agent-engine";
import type { ExecutionPlan, ExecutionStep } from "../types";

/**
 * `validatePlan` existed from the beginning but was never called by any route —
 * the Read-Only toggle and the required-param rules were prompt-only. These
 * tests pin the rules now that /copilot/execute enforces them, including the
 * end-to-end property that a plan generated in Read-Only mode cannot carry a
 * write step into execution.
 */

const step = (over: Partial<ExecutionStep> = {}): ExecutionStep => ({
  order: 1,
  capability: "create_class",
  description: "Create a class",
  params: { name: "Basic 1" },
  ...over,
});

const plan = (over: Partial<ExecutionPlan> = {}): ExecutionPlan => ({
  summary: "Test plan",
  steps: [step()],
  estimatedOperations: 1,
  mode: "operations",
  warnings: [],
  ...over,
});

describe("validatePlan", () => {
  it("accepts a well-formed plan", () => {
    expect(validatePlan(plan())).toEqual({ valid: true, errors: [] });
  });

  it("rejects an unknown capability", () => {
    const result = validatePlan(plan({ steps: [step({ capability: "make_magic" })] }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Unknown capability/);
  });

  it("rejects a step missing a required parameter", () => {
    const result = validatePlan(
      plan({ steps: [step({ params: {} }), step({ order: 2, capability: "create_class", params: { name: "Basic 2" }, dependsOn: [1] })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Missing required parameter "name"/);
  });

  it("rejects a write step inside a Read-Only plan", () => {
    const result = validatePlan(plan({ mode: "read_only" }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/write operation but mode is read_only/);
  });

  it("allows a read step inside a Read-Only plan", () => {
    const result = validatePlan(
      plan({ mode: "read_only", steps: [step({ capability: "list_classes", params: {} })] }),
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects dependencies on missing or later steps", () => {
    const missing = validatePlan(plan({ steps: [step({ dependsOn: [7] })] }));
    expect(missing.errors[0]).toMatch(/Depends on step 7 which doesn't exist/);

    const later = validatePlan(
      plan({
        steps: [step({ dependsOn: [2] }), step({ order: 2, capability: "create_class", params: { name: "X" } })],
      }),
    );
    expect(later.errors.join(" ")).toMatch(/Cannot depend on step 2/);
  });
});

describe("extractPlan", () => {
  const content = [
    "Here is the plan:",
    "```json",
    JSON.stringify({
      plan: {
        summary: "Two steps",
        steps: [
          { order: 1, capability: "create_class", description: "Create a class", params: { name: "Basic 1" } },
          { order: 2, capability: "make_magic", description: "Hallucinated", params: {} },
        ],
      },
    }),
    "```",
  ].join("\n");

  it("parses the fenced plan and drops hallucinated capabilities", () => {
    const extracted = extractPlan(content, "operations");
    expect(extracted?.steps.map((s) => s.capability)).toEqual(["create_class"]);
    expect(extracted?.mode).toBe("operations");
  });

  it("carries the generation mode, so a write plan from Read-Only mode is refused", () => {
    const extracted = extractPlan(content, "read_only");
    expect(extracted?.mode).toBe("read_only");
    // The point of carrying the mode: enforcement at execute time, end to end.
    expect(validatePlan(extracted!).valid).toBe(false);
  });

  it("returns null when there is no plan", () => {
    expect(extractPlan("Just prose, no plan here.", "operations")).toBeNull();
  });
});
