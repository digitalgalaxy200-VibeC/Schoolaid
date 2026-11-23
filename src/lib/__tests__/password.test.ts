import { describe, it, expect } from "vitest";
import { DEFAULT_STUDENT_PASSWORD, defaultStudentPassword } from "../password";

/**
 * The one student password.
 *
 * These cases pin the VALUE, because it is a promise made to teachers: the
 * password printed on a class sheet, the one a reset restores, and the one a new
 * student is created with must all be the same string. If the school changes its
 * mind, this file is where the change shows up.
 */
describe("defaultStudentPassword", () => {
  it("is S12345", () => {
    expect(defaultStudentPassword()).toBe("S12345");
  });

  it("is the same value the constant exports", () => {
    expect(defaultStudentPassword()).toBe(DEFAULT_STUDENT_PASSWORD);
  });

  it("is identical for every school", () => {
    // The school asked for ONE password for all students. Nothing about the
    // caller may change it — there is no school argument any more, and this
    // test fails loudly if one is reintroduced.
    expect(defaultStudentPassword.length).toBe(0);
    expect(defaultStudentPassword()).toBe(defaultStudentPassword());
  });

  it("stays within the auth provider's 72-character ceiling", () => {
    expect(defaultStudentPassword().length).toBeLessThanOrEqual(72);
  });
});
