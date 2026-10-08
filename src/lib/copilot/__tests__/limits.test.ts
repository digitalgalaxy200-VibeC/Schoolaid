import { describe, it, expect } from "vitest";
import {
  MAX_PLAN_BYTES,
  checkPlanPayload,
  planPayloadBytes,
  utf8Bytes,
} from "../limits";

/** P1 — payload limits. Oversized plans fail explicitly; they are not truncated. */

describe("payload limits", () => {
  it("accepts a small plan", () => {
    const plan = {
      summary: "Create one class",
      steps: [{ order: 1, capability: "create_class", params: { name: "Basic 1" } }],
    };
    const check = checkPlanPayload(plan);
    expect(check.ok).toBe(true);
    expect(check.bytes).toBeLessThanOrEqual(MAX_PLAN_BYTES);
  });

  it("refuses an oversized plan and reports both sizes", () => {
    const big = { summary: "x".repeat(MAX_PLAN_BYTES + 10), steps: [] };
    const check = checkPlanPayload(big);
    expect(check.ok).toBe(false);
    expect(check.maxBytes).toBe(MAX_PLAN_BYTES);
    expect(check.bytes).toBeGreaterThan(MAX_PLAN_BYTES);
  });

  it("counts UTF-8 bytes, not characters", () => {
    expect(utf8Bytes("é")).toBe(2);
    expect(planPayloadBytes(null)).toBe(utf8Bytes("null"));
  });

  it("treats an un-serialisable plan as refused", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(checkPlanPayload(cyclic).ok).toBe(false);
  });
});
