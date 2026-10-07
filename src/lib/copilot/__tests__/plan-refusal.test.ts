import { describe, it, expect } from "vitest";
import { explainPlanRefusal, READ_ONLY_PLAN_REASON } from "../plan-refusal";

/**
 * The refusal is the whole message the Super Admin gets when Approve does
 * nothing, so "cannot execute" alone is a bug: it must say why, and say what to
 * do about it.
 */

describe("explainPlanRefusal", () => {
  it("names Read-Only mode and says how to get past it", () => {
    const message = explainPlanRefusal([
      'Step 2: "create_class" is a write operation but mode is read_only',
    ]);
    expect(message).toBe(READ_ONLY_PLAN_REASON);
    expect(message).toContain("Read-Only");
    expect(message).toContain("Switch the toggle to Operations");
  });

  it("explains a mixed refusal without hiding either reason", () => {
    const message = explainPlanRefusal([
      'Step 2: "create_class" is a write operation but mode is read_only',
      'Step 3: Missing required parameter "name" for create_class',
    ]);
    expect(message).toContain("Read-Only");
    expect(message).toContain("Missing required parameter");
  });

  it("reports other validation failures on their own", () => {
    const message = explainPlanRefusal(['Step 1: Unknown capability "make_coffee"']);
    expect(message).not.toContain("Read-Only");
    expect(message).toContain('Unknown capability "make_coffee"');
  });

  it("still says something when the server gave no reasons", () => {
    expect(explainPlanRefusal([])).toBe("This plan could not be executed.");
  });
});
