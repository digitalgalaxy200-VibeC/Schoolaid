import { describe, it, expect } from "vitest";
import { escapeLikePattern, normaliseAccountEmail } from "../account/email";

/**
 * A school admin changing their sign-in address.
 *
 * Two rules earn a test: the stored form must be the form sign-in looks up, and
 * an address containing LIKE wildcards must not widen the uniqueness check.
 */

describe("normaliseAccountEmail", () => {
  it("trims and lowercases, because sign-in lowercases before looking up", () => {
    expect(normaliseAccountEmail("  Admin@School.Edu.NG  ")).toEqual({
      ok: true,
      email: "admin@school.edu.ng",
    });
  });

  it("accepts the ordinary shapes a school will type", () => {
    for (const email of ["a@b.co", "first.last+tag@sub.domain.org", "o'brien@school.ie"]) {
      expect(normaliseAccountEmail(email).ok, email).toBe(true);
    }
  });

  it("refuses what is obviously not an address, with a reason", () => {
    for (const value of ["", "   ", "admin", "admin@", "@school.com", "a@b", "two words@school.com"]) {
      const result = normaliseAccountEmail(value);
      expect(result.ok, JSON.stringify(value)).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("refuses a non-string without throwing", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(normaliseAccountEmail(value).ok).toBe(false);
    }
  });

  it("refuses an address past the column limit", () => {
    const long = `${"a".repeat(250)}@school.com`;
    const result = normaliseAccountEmail(long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too long");
  });
});

describe("escapeLikePattern", () => {
  it("escapes the three characters LIKE treats specially", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("leaves an ordinary address untouched", () => {
    expect(escapeLikePattern("admin@school.edu.ng")).toBe("admin@school.edu.ng");
  });
});
