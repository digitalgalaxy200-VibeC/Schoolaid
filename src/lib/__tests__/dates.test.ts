import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../dates";

/**
 * The platform's display format: dd/MMM/yy. Two properties matter more than
 * the string itself — a stored calendar date must never shift a day, and the
 * result must not depend on the machine's timezone or locale (the same value
 * renders the same on the server and in every browser).
 */

describe("formatDate — dd/MMM/yy", () => {
  it("formats a stored calendar date verbatim, with no timezone shift", () => {
    expect(formatDate("2026-09-06")).toBe("06/Sep/26");
  });

  it("pads a single-digit day", () => {
    expect(formatDate("2026-01-05")).toBe("05/Jan/26");
  });

  it("renders a timestamp in Lagos time: 23:30 Lagos is still the same day", () => {
    expect(formatDate("2026-09-30T22:30:00Z")).toBe("30/Sep/26");
  });

  it("rolls to the next Lagos day once UTC crosses 23:00", () => {
    expect(formatDate("2026-09-30T23:30:00Z")).toBe("01/Oct/26");
  });

  it("accepts a Date object", () => {
    expect(formatDate(new Date("2026-09-30T12:00:00Z"))).toBe("30/Sep/26");
  });

  it("shows the placeholder for missing values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("shows the placeholder for unreadable values, never 'Invalid Date'", () => {
    expect(formatDate("not a date")).toBe("—");
    expect(formatDate("2026-13-01")).toBe("—");
  });
});

describe("formatTime — 24-hour Lagos clock", () => {
  it("drops seconds", () => {
    expect(formatTime("2026-09-30T13:05:59Z")).toBe("14:05");
  });

  it("renders Lagos midnight as 00:00, not 24:00", () => {
    expect(formatTime("2026-09-30T23:00:00Z")).toBe("00:00");
  });

  it("has no time to show for a date-only value", () => {
    expect(formatTime("2026-09-06")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("joins the date and the Lagos-local time", () => {
    expect(formatDateTime("2026-09-30T13:05:00Z")).toBe("30/Sep/26, 14:05");
  });

  it("renders a date-only value as just the date — an invented time would be a claim", () => {
    expect(formatDateTime("2026-09-06")).toBe("06/Sep/26");
  });

  it("shows the placeholder for unreadable values", () => {
    expect(formatDateTime("nope")).toBe("—");
  });
});
