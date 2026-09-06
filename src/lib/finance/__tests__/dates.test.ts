// Date helper tests — school-local (Lagos, UTC+1) calendar day logic.
// Run: npm test
import { describe, it, expect } from "vitest";
import { lagosDate, todayLocal, paidOnDate } from "../dates";

describe("lagosDate", () => {
  it("keeps the same calendar day for most UTC times", () => {
    // 22:30 UTC = 23:30 Lagos, still the same day
    expect(lagosDate("2026-09-06T22:30:00.000Z")).toBe("2026-09-06");
  });
  it("rolls into the next Lagos day after 23:00 UTC", () => {
    // 23:30 UTC = 00:30 Lagos on the 7th
    expect(lagosDate("2026-09-06T23:30:00.000Z")).toBe("2026-09-07");
  });
  it("handles early-morning Lagos payments", () => {
    // 00:30 UTC on the 6th = 01:30 Lagos on the 6th
    expect(lagosDate("2026-09-06T00:30:00.000Z")).toBe("2026-09-06");
  });
});

describe("paidOnDate", () => {
  it("keeps a date-only picker value exactly", () => {
    expect(paidOnDate("2026-09-06")).toBe("2026-09-06");
  });
  it("converts full timestamps to the Lagos calendar date", () => {
    expect(paidOnDate("2026-09-06T23:30:00.000Z")).toBe("2026-09-07");
  });
  it("falls back to the local today when empty", () => {
    expect(paidOnDate(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(paidOnDate(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("falls back to the local today on invalid input", () => {
    expect(paidOnDate("not-a-date")).toBe(todayLocal());
  });
});
