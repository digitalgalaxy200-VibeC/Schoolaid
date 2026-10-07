import { describe, it, expect } from "vitest";
import { schoolAbbreviationFrom } from "../school-provisioning";

/**
 * The abbreviation feeds generated usernames (`ada@gra.com`). It used to live
 * inline in the Add School route, which is why a school created through the
 * Copilot had no abbreviation at all and its students' usernames fell back to
 * `@school.com`. Both paths now call this function, and these tests pin the
 * format the existing schools were created with.
 */
describe("schoolAbbreviationFrom", () => {
  it("uses the first three letters of a single-word name", () => {
    expect(schoolAbbreviationFrom("Grace")).toBe("gra");
    expect(schoolAbbreviationFrom("Queensview")).toBe("que");
  });

  it("uses the initials of a multi-word name", () => {
    expect(schoolAbbreviationFrom("Grace Academy")).toBe("ga");
    expect(schoolAbbreviationFrom("GS Apex Stars")).toBe("gas");
  });

  it("is not confused by extra or leading whitespace", () => {
    expect(schoolAbbreviationFrom("  Grace   Academy  ")).toBe("ga");
  });

  it("returns an empty string for an empty name", () => {
    expect(schoolAbbreviationFrom("")).toBe("");
    expect(schoolAbbreviationFrom("   ")).toBe("");
  });
});
