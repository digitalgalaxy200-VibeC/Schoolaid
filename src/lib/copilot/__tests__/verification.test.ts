import { describe, it, expect } from "vitest";
import {
  compareForVerification,
  normalizeStepResult,
  withVerification,
  type StepMeta,
} from "../step-result";

/**
 * P1 — read-after-write verification.
 *
 * "success" and "verified" are deliberately different words: the first means
 * the write was accepted, the second means it was read back and matched.
 */

const meta = (over: Partial<StepMeta> = {}): StepMeta => ({
  capability: "create_class",
  tenantId: "school_123",
  requestId: "req_test",
  startedAtMs: 0,
  nowMs: () => 0,
  ...over,
});

describe("compareForVerification", () => {
  it("verifies when the read-back matches the asserted fields", () => {
    const r = compareForVerification(
      { id: "c1", name: "Basic 1" },
      { id: "c1", name: "Basic 1" },
      ["name"],
    );
    expect(r).toEqual({ verified: true, mismatches: [] });
  });

  it("reports which fields did not match", () => {
    const r = compareForVerification({ name: "Basic 1" }, { name: "Basic 2" }, ["name"]);
    expect(r.verified).toBe(false);
    expect(r.mismatches).toContain("name");
  });

  it("verifies existence alone when no fields are asserted", () => {
    expect(compareForVerification({ id: "c1" }, { id: "c1" }, []).verified).toBe(true);
  });

  it("fails when the record was not found", () => {
    const r = compareForVerification({ id: "c1" }, null, []);
    expect(r.verified).toBe(false);
    expect(r.mismatches).toContain("record not found");
  });

  it("ignores fields the expected object never claimed", () => {
    // The create returned only an id, so `name` is not asserted — it cannot be
    // a mismatch, and existence is enough.
    const r = compareForVerification({ id: "c1" }, { id: "c1", name: "whatever" }, ["name"]);
    expect(r.verified).toBe(true);
  });
});

describe("withVerification", () => {
  it("attaches verification without changing a success", () => {
    const base = normalizeStepResult({ id: "c1" }, meta());
    const attached = withVerification(base, { attempted: true, verified: true });

    expect(attached.status).toBe("success");
    expect(attached.verification?.verified).toBe(true);
    expect(attached.request_id).toBe(base.request_id);
  });
});
