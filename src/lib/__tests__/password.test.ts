import { describe, it, expect } from "vitest";
import { defaultStudentPassword } from "../password";

/**
 * The school's shared student password.
 *
 * These cases pin the SHAPE, because it is a promise made to teachers: the
 * password printed on a class sheet, the one a reset restores, and the one an
 * existing student was created with must all be the same string. Change the
 * shape and every reset starts handing out something the school has never seen.
 */
describe("defaultStudentPassword", () => {
  it("is the abbreviation repeated three times plus 123", () => {
    expect(defaultStudentPassword({ abbreviation: "cvs", name: "Creamsville School" })).toBe(
      "cvscvscvs123",
    );
  });

  it("uses the abbreviation exactly as stored, including its case", () => {
    // Creation has always used the raw column; lower-casing here would have
    // produced a different password for the same school.
    expect(defaultStudentPassword({ abbreviation: "CVS" })).toBe("CVSCVSCVS123");
  });

  it("falls back to the first five letters of the name, lower-cased", () => {
    expect(defaultStudentPassword({ name: "Creamsville School" })).toBe(
      "creamcreamcream123",
    );
    // Lower-case first, then drop spaces: "St Ma" → "stma".
    expect(defaultStudentPassword({ name: "St Mary's" })).toBe("stmastmastma123");
  });

  it("never returns an empty or undefined-looking value", () => {
    expect(defaultStudentPassword(null)).toBe("schooschooschoo123");
    expect(defaultStudentPassword({})).toBe("schooschooschoo123");
  });

  it("stays within the auth provider's 72-character ceiling", () => {
    const long = "abcdefghijklmnopqrstuvwxyz";
    expect(defaultStudentPassword({ abbreviation: long }).length).toBeLessThanOrEqual(72);
  });
});
