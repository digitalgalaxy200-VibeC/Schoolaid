import { describe, it, expect } from "vitest";
import { isUuid } from "../ids";

/**
 * The panel shows an optimistic bubble with `s-<timestamp>` before the row is
 * saved. Sending that to an update on a uuid column matches nothing (or errors),
 * which is how a plan's outcome was never recorded and the plan came back as
 * "Awaiting Approval". Routes must be able to tell the two apart.
 */
describe("isUuid", () => {
  it("accepts a saved row id", () => {
    expect(isUuid("d2881b92-c686-4e5e-b132-071a42c116cc")).toBe(true);
  });

  it("rejects the panel's optimistic ids", () => {
    expect(isUuid("s-1750000000000")).toBe(false);
    expect(isUuid("t-1750000000000")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("rejects a uuid with trailing characters", () => {
    expect(isUuid("d2881b92-c686-4e5e-b132-071a42c116cc\n")).toBe(false);
  });
});
