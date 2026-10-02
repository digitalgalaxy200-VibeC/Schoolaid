import { describe, it, expect } from "vitest";
import { ValidationErrors } from "@/lib/validate";
import { composeFullName, parseTeacherStudentEdit, splitStoredName } from "../teacher-editable";

const parse = (body: unknown) => {
  const errors = new ValidationErrors();
  const edit = parseTeacherStudentEdit(body, errors);
  return { edit, errors };
};

const valid = (over: Record<string, unknown> = {}) => ({
  first_name: "Azubuike",
  middle_name: "Chisom",
  last_name: "Okafor",
  date_of_birth: "2015-04-01",
  gender: "male",
  parent_phone: "0803 123 4567",
  ...over,
});

describe("composeFullName", () => {
  it("joins the name parts in display order", () => {
    expect(
      composeFullName({ first_name: "Azubuike", middle_name: "Chisom", last_name: "Okafor" }),
    ).toBe("Azubuike Chisom Okafor");
  });

  it("skips an empty middle name", () => {
    expect(
      composeFullName({ first_name: "Azubuike", middle_name: null, last_name: "Okafor" }),
    ).toBe("Azubuike Okafor");
  });
});

describe("splitStoredName", () => {
  it("prefers the stored parts when any exist", () => {
    expect(
      splitStoredName({
        first: "Azubuike",
        middle: "Chisom",
        last: "Okafor",
        fullName: "something entirely different",
      }),
    ).toEqual({ first: "Azubuike", middle: "Chisom", last: "Okafor" });
  });

  it("falls back to splitting a legacy full name", () => {
    expect(
      splitStoredName({ first: null, middle: null, last: null, fullName: "Azubuike Chisom Okafor" }),
    ).toEqual({ first: "Azubuike", middle: "Chisom", last: "Okafor" });
  });

  it("handles a two-word name and a single-word name", () => {
    expect(
      splitStoredName({ first: null, middle: null, last: null, fullName: "Azubuike Okafor" }),
    ).toEqual({ first: "Azubuike", middle: "", last: "Okafor" });
    expect(
      splitStoredName({ first: null, middle: null, last: null, fullName: "Azubuike" }),
    ).toEqual({ first: "Azubuike", middle: "", last: "" });
  });

  it("returns empties when there is nothing to show", () => {
    expect(
      splitStoredName({ first: null, middle: null, last: null, fullName: "  " }),
    ).toEqual({ first: "", middle: "", last: "" });
  });
});

describe("parseTeacherStudentEdit", () => {
  it("accepts a complete form and trims every value", () => {
    const { edit, errors } = parse(valid({ first_name: "  Azubuike  " }));
    expect(errors.ok).toBe(true);
    expect(edit).toEqual({
      first_name: "Azubuike",
      middle_name: "Chisom",
      last_name: "Okafor",
      date_of_birth: "2015-04-01",
      gender: "male",
      parent_phone: "0803 123 4567",
    });
  });

  it("clears optional fields when they are sent empty", () => {
    const { edit, errors } = parse(
      valid({ middle_name: "", date_of_birth: "", gender: "", parent_phone: "" }),
    );
    expect(errors.ok).toBe(true);
    expect(edit).toEqual({
      first_name: "Azubuike",
      middle_name: null,
      last_name: "Okafor",
      date_of_birth: null,
      gender: null,
      parent_phone: null,
    });
  });

  it("refuses a student with no name at all", () => {
    const { edit, errors } = parse(valid({ first_name: "", last_name: "   " }));
    expect(edit).toBeNull();
    expect(errors.list.some((e) => /first or last name/.test(e.message))).toBe(true);
  });

  it("allows a single-word name", () => {
    const { edit, errors } = parse(valid({ first_name: "", last_name: "Okafor" }));
    expect(errors.ok).toBe(true);
    expect(composeFullName(edit!)).toBe("Chisom Okafor");
  });

  it("refuses a date that is not a real calendar date", () => {
    const { edit, errors } = parse(valid({ date_of_birth: "2026-02-31" }));
    expect(edit).toBeNull();
    expect(errors.list.map((e) => e.field)).toContain("date_of_birth");
  });

  it("refuses a date in the future", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { errors } = parse(valid({ date_of_birth: tomorrow }));
    expect(errors.list.some((e) => /future/.test(e.message))).toBe(true);
  });

  it("normalises gender and refuses anything else", () => {
    expect(parse(valid({ gender: "FEMALE" })).edit?.gender).toBe("female");
    expect(parse(valid({ gender: "other" })).edit).toBeNull();
  });

  it("refuses an over-long phone number", () => {
    const { errors } = parse(valid({ parent_phone: "0".repeat(41) }));
    expect(errors.list.some((e) => e.field === "parent_phone")).toBe(true);
  });

  it("IGNORES administrative keys: class transfer and account state are unreachable", () => {
    const { edit } = parse(
      valid({
        class_id: "11111111-1111-1111-1111-111111111111",
        student_id: "HACK/001",
        status: "graduated",
        is_active: false,
        recovery_email: "attacker@example.test",
        school_id: "22222222-2222-2222-2222-222222222222",
        profile_id: "33333333-3333-3333-3333-333333333333",
      }),
    );
    expect(edit).not.toBeNull();
    expect(Object.keys(edit!).sort()).toEqual(
      ["date_of_birth", "first_name", "gender", "last_name", "middle_name", "parent_phone"].sort(),
    );
  });

  it("does not throw on a null or non-object body", () => {
    for (const body of [null, undefined, 42, "nope", []]) {
      expect(() => parse(body)).not.toThrow();
      expect(parse(body).edit).toBeNull();
    }
  });
});
