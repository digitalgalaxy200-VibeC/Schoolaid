import { describe, it, expect } from "vitest";
import {
  DEFAULT_STEP_TIMEOUT_MS,
  StepExecutionError,
  newRequestId,
  normalizeStepResult,
  outcomeToStepResult,
  runWithTimeout,
  stepStatusFor,
  unknownResult,
  type StepMeta,
} from "../step-result";
import { validatePlan, extractPlan } from "../agent-engine";

/**
 * P0 — execution reliability.
 *
 * These pin the rules that stop the engine reporting a save that never
 * happened:
 *   B  an empty/undefined return is `unknown`, never `completed`;
 *   C  a lost response is `unknown` (never described as saved);
 *   D  a timeout is `unknown`, not `completed`;
 *   E  an unknown capability is refused, not silently dropped;
 *   F  every execution carries a unique, traceable request id;
 *   A  a real success carries the whole contract.
 *
 * The functions under test are pure, so this suite needs no database.
 */

const meta = (over: Partial<StepMeta> = {}): StepMeta => ({
  capability: "create_class",
  tenantId: "school_123",
  requestId: newRequestId(),
  startedAtMs: 1_000,
  nowMs: () => 1_250,
  ...over,
});

describe("StepResult contract", () => {
  it("T-A — a successful write carries the whole contract", () => {
    const r = normalizeStepResult({ id: "cls_1", name: "Basic 1" }, meta());

    expect(r.status).toBe("success");
    expect(r.request_id).toMatch(/^req_/);
    expect(r.operation).toBe("create_class");
    expect(r.capability).toBe("create_class");
    expect(r.tenant_id).toBe("school_123");
    expect(r.entity_id).toBe("cls_1");
    expect(r.data).toEqual({ id: "cls_1", name: "Basic 1" });
    expect(r.meta.duration_ms).toBe(250);
    expect(new Date(r.meta.timestamp).toISOString()).toBe(r.meta.timestamp);
  });

  it("T-B — undefined and null are UNKNOWN, never success", () => {
    for (const raw of [undefined, null]) {
      const r = normalizeStepResult(raw, meta());
      expect(r.status).toBe("unknown");
      expect(r.error?.code).toBe("MISSING_EXECUTION_RESULT");
      // The mapping the engine uses to write the step row.
      expect(stepStatusFor(r)).toBe("unknown");
    }
  });

  it("an empty list is a real read result, not a missing one", () => {
    const r = normalizeStepResult([], meta({ capability: "list_classes" }));
    expect(r.status).toBe("success");
  });

  it("T-C — an outcome that cannot be established is unknown, not saved", () => {
    const r = unknownResult("RESULT_UNAVAILABLE", "no response received", meta());
    expect(r.status).toBe("unknown");
    expect(r.status).not.toBe("success");
    expect(stepStatusFor(r)).not.toBe("completed");
  });
});

describe("runWithTimeout", () => {
  it("returns the value when the capability finishes in time", async () => {
    const outcome = await runWithTimeout(async () => 42, 1000);
    expect(outcome).toEqual({ kind: "resolved", value: 42 });
  });

  it("T-D — a step past its timeout becomes unknown, not completed", async () => {
    const outcome = await runWithTimeout(() => new Promise(() => {}), 5);
    expect(outcome.kind).toBe("timeout");

    const r = outcomeToStepResult(outcome, meta());
    expect(r.status).toBe("unknown");
    expect(r.error?.code).toBe("EXECUTION_TIMEOUT");
    expect(stepStatusFor(r)).toBe("unknown");
  });

  it("classifies a thrown capability as an error with its code", async () => {
    const outcome = await runWithTimeout(async () => {
      throw new StepExecutionError("UNKNOWN_CAPABILITY", "nope");
    }, 1000);
    const r = outcomeToStepResult(outcome, meta());
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("UNKNOWN_CAPABILITY");
    expect(r.error?.message).toBe("nope");
    expect(stepStatusFor(r)).toBe("failed");
  });

  it("a synchronous throw is a rejection, not a hang", async () => {
    const outcome = await runWithTimeout(() => {
      throw new Error("boom");
    }, 1000);
    expect(outcome.kind).toBe("rejected");
    const r = outcomeToStepResult(outcome, meta());
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("EXECUTION_ERROR");
    expect(r.error?.message).toBe("boom");
  });

  it("has a sane default timeout", () => {
    expect(DEFAULT_STEP_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("request ids", () => {
  it("T-F — ids are unique and traceable into the contract", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^req_/);
    expect(a).not.toBe(b);

    const r = normalizeStepResult({ ok: true }, meta({ requestId: a }));
    expect(r.request_id).toBe(a);
  });
});

describe("unknown capabilities", () => {
  const content = [
    "Here is the plan:",
    "```json",
    JSON.stringify({
      plan: {
        summary: "Two steps",
        steps: [
          { order: 1, capability: "create_class", params: { name: "Basic 1" } },
          { order: 2, capability: "make_magic", params: {} },
        ],
      },
    }),
    "```",
  ].join("\n");

  it("T-E — are retained and refused, not silently dropped", () => {
    const extracted = extractPlan(content, "operations");
    expect(extracted?.steps.map((s) => s.capability)).toContain("make_magic");

    const v = validatePlan(extracted!);
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toMatch(/Unknown capability "make_magic"/);
  });
});
