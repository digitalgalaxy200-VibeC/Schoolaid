import { describe, it, expect } from "vitest";
import { DEFAULT_STRAND_THRESHOLD_MS, isStranded } from "../recovery";

/**
 * P1 — recovery. A stranded operation resolves to UNKNOWN, never completed:
 * we do not know whether the in-flight dispatch landed.
 */

describe("isStranded", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  it("is false for an operation that is not executing", () => {
    expect(isStranded("completed", "2020-01-01T00:00:00Z", now)).toBe(false);
    expect(isStranded("failed", "2020-01-01T00:00:00Z", now)).toBe(false);
    expect(isStranded("unknown", "2020-01-01T00:00:00Z", now)).toBe(false);
  });

  it("is false for a recent executing operation", () => {
    const started = new Date(now - 60_000).toISOString();
    expect(isStranded("executing", started, now)).toBe(false);
  });

  it("is true once past the threshold", () => {
    const started = new Date(now - DEFAULT_STRAND_THRESHOLD_MS - 1).toISOString();
    expect(isStranded("executing", started, now)).toBe(true);
  });

  it("treats a missing or invalid started_at as stranded", () => {
    expect(isStranded("executing", null, now)).toBe(true);
    expect(isStranded("executing", "not-a-date", now)).toBe(true);
  });
});
