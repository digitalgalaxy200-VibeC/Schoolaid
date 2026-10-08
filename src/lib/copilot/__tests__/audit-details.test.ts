import { describe, it, expect } from "vitest";
import { buildAuditDetails } from "../audit-logger";

/**
 * P2 — richer audit records. The outcome, request id and error are recorded as
 * first-class fields, so a log no longer needs prose-parsing to answer "did it
 * succeed, and under which request".
 */

describe("buildAuditDetails", () => {
  it("merges the structured fields into the details payload", () => {
    const details = buildAuditDetails({
      schoolId: "s",
      superAdminId: "u",
      action: "step_completed",
      requestId: "req_1",
      resultStatus: "success",
      entityId: "cls_1",
      details: { capability: "create_class" },
    });
    expect(details).toEqual({
      capability: "create_class",
      request_id: "req_1",
      result_status: "success",
      entity_id: "cls_1",
    });
  });

  it("records an error message as a field", () => {
    const details = buildAuditDetails({
      schoolId: "s",
      superAdminId: "u",
      action: "step_failed",
      error: "boom",
    });
    expect(details).toEqual({ error: "boom" });
  });

  it("returns null when there is nothing to record", () => {
    expect(buildAuditDetails({ schoolId: "s", superAdminId: "u", action: "x" })).toBeNull();
  });

  it("keeps free-form details alongside the structured ones", () => {
    const details = buildAuditDetails({
      schoolId: "s",
      superAdminId: "u",
      action: "x",
      details: { a: 1 },
      requestId: "req_2",
    });
    expect(details).toEqual({ a: 1, request_id: "req_2" });
  });
});
