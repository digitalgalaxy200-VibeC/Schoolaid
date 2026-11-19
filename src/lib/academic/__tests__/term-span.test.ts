import { describe, it, expect } from "vitest";
import { dateRangeError, durationInWeeks, splitSpan } from "../term-span";

/**
 * Why these exist: a session's three default terms were created with the
 * session's own start and end, so every term read the same range. These pin the
 * behaviour that replaces it — consecutive slices that together cover exactly
 * the session.
 */

describe("splitSpan", () => {
  it("cuts a school year into three consecutive terms", () => {
    expect(splitSpan("2026-09-07", "2027-07-16", 3)).toEqual([
      { start: "2026-09-07", end: "2026-12-20" },
      { start: "2026-12-21", end: "2027-04-03" },
      { start: "2027-04-04", end: "2027-07-16" },
    ]);
  });

  it("keeps the spans contiguous and inside the session", () => {
    const spans = splitSpan("2026-09-07", "2027-07-16", 3);
    expect(spans[0].start).toBe("2026-09-07");
    expect(spans[2].end).toBe("2027-07-16");

    for (let i = 1; i < spans.length; i++) {
      const previousEnd = Date.parse(spans[i - 1].end);
      const nextStart = Date.parse(spans[i].start);
      expect(nextStart - previousEnd).toBe(86_400_000); // exactly the next day
    }
  });

  it("never overlaps and never invents days", () => {
    for (const [start, end, count] of [
      ["2026-01-01", "2026-01-31", 3],
      ["2026-02-01", "2026-02-03", 3],
      ["2024-02-01", "2024-03-01", 4],
    ] as const) {
      const spans = splitSpan(start, end, count);
      expect(spans).toHaveLength(count);

      const days = spans.reduce(
        (sum, span) =>
          sum + (Date.parse(span.end) - Date.parse(span.start)) / 86_400_000 + 1,
        0,
      );
      expect(days).toBe((Date.parse(end) - Date.parse(start)) / 86_400_000 + 1);
    }
  });

  it("refuses ranges it cannot describe", () => {
    expect(splitSpan("", "2026-12-21", 3)).toEqual([]);
    expect(splitSpan("2026-12-21", "", 3)).toEqual([]);
    expect(splitSpan("2026-12-21", "2026-09-07", 3)).toEqual([]); // backwards
    expect(splitSpan("2026-02-30", "2026-03-31", 3)).toEqual([]); // not a date
    expect(splitSpan("2026-01-01", "2026-01-02", 3)).toEqual([]); // fewer days than terms
    expect(splitSpan("2026-01-01", "2026-01-31", 0)).toEqual([]);
  });
});

describe("durationInWeeks", () => {
  it("reports whole weeks", () => {
    expect(durationInWeeks("2026-09-07", "2026-09-20")).toBe(2);
    expect(durationInWeeks("2026-09-07", "2026-09-07")).toBe(1);
  });

  it("is null for an impossible range", () => {
    expect(durationInWeeks("2026-09-20", "2026-09-07")).toBeNull();
    expect(durationInWeeks("", "")).toBeNull();
  });
});

describe("dateRangeError", () => {
  it("accepts a normal range and an empty one", () => {
    expect(dateRangeError("2026-09-07", "2026-12-21")).toBeNull();
    expect(dateRangeError("", "")).toBeNull();
    expect(dateRangeError(null, undefined)).toBeNull();
  });

  it("refuses a backwards range with a sentence", () => {
    expect(dateRangeError("2026-12-21", "2026-09-07")).toBe(
      "The end date cannot be before the start date.",
    );
  });

  it("refuses a date that does not exist", () => {
    expect(dateRangeError("2026-02-30", "2026-03-31")).toBe(
      "The start date is not a valid date.",
    );
  });
});
