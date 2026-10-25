import { describe, it, expect } from "vitest";
import {
  PROFILE_GATE_PERCENT,
  assessProfile,
  editableProfileFields,
  profilePath,
} from "../profile-completion";

/**
 * The 50% gate, pinned.
 *
 * The point of the gate is a way to REACH the person — a phone number or a
 * contact email — not a finished file. The full name is always stored, so in
 * practice 50 points means "at least one contact detail". Gender is collected
 * but must never be the field that unlocks a dashboard on its own.
 */

const full = {
  full_name: "Ada Obi",
  gender: "female",
  phone: "08031234567",
  contact_email: "ada@example.com",
};

describe("assessProfile — teachers and students", () => {
  it("scores a complete profile 100 and opens the dashboard", () => {
    const result = assessProfile("teacher", full);
    expect(result.percent).toBe(100);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("opens the dashboard on the name plus ONE contact detail", () => {
    expect(assessProfile("teacher", { full_name: "Ada Obi", phone: "08031234567" })).toMatchObject({
      percent: 60,
      complete: true,
    });
    expect(
      assessProfile("teacher", { full_name: "Ada Obi", contact_email: "ada@example.com" }),
    ).toMatchObject({ percent: 60, complete: true });
    expect(
      assessProfile("student", {
        full_name: "Ada Obi",
        phone: "08031234567",
        contact_email: "ada@example.com",
      }),
    ).toMatchObject({ percent: 90, complete: true });
  });

  it("does NOT unlock on a name and a gender alone", () => {
    const result = assessProfile("teacher", { full_name: "Ada Obi", gender: "female" });
    expect(result.percent).toBe(40);
    expect(result.complete).toBe(false);
    expect(result.missing.sort()).toEqual(["contact_email", "phone"]);
  });

  it("is not complete for a brand-new account with only a name", () => {
    const result = assessProfile("teacher", { full_name: "Ada Obi" });
    expect(result.percent).toBe(30);
    expect(result.complete).toBe(false);
  });

  it("treats whitespace as empty", () => {
    const result = assessProfile("teacher", { ...full, phone: "   " });
    expect(result.missing).toEqual(["phone"]);
  });

  it("does not require a well-formed value — presence is the rule", () => {
    // A stored value the write path accepted must never shut someone out.
    const result = assessProfile("student", { ...full, phone: "call the office" });
    expect(result.percent).toBe(100);
  });

  it("defaults a missing snapshot to zero, without throwing", () => {
    expect(assessProfile("teacher", {}).percent).toBe(0);
    expect(assessProfile("student", {})).toMatchObject({ percent: 0, complete: false });
  });
});

describe("assessProfile — school admins represent the institution", () => {
  it("has no gender field at all", () => {
    expect(editableProfileFields("school_admin")).toEqual(["full_name", "phone", "contact_email"]);
    const result = assessProfile("school_admin", {
      full_name: "Creamsville School",
      phone: "09011526026",
      contact_email: "school@example.com",
    });
    expect(result.percent).toBe(100);
  });

  it("needs the name and one contact channel", () => {
    for (const contact of ["phone", "contact_email"] as const) {
      const result = assessProfile("school_admin", {
        full_name: "Creamsville School",
        [contact]: "value",
      });
      expect(result.percent, contact).toBe(70);
      expect(result.complete, contact).toBe(true);
    }
  });

  it("stays closed with only the name", () => {
    expect(assessProfile("school_admin", { full_name: "Creamsville School" }).percent).toBe(40);
    expect(assessProfile("school_admin", { full_name: "Creamsville School" }).complete).toBe(false);
  });

  it("ignores a gender value even if one is sent", () => {
    expect(assessProfile("school_admin", { ...full }).percent).toBe(100);
  });
});

describe("assessProfile — super admin", () => {
  it("is never gated and has no profile page", () => {
    expect(assessProfile("super_admin", {}).complete).toBe(true);
    expect(profilePath("super_admin")).toBeNull();
  });
});

describe("profilePath", () => {
  it("points each role at its own profile", () => {
    expect(profilePath("teacher")).toBe("/teacher/profile");
    expect(profilePath("student")).toBe("/student/profile");
    expect(profilePath("school_admin")).toBe("/school-admin/profile");
    expect(profilePath("unknown")).toBeNull();
  });
});

describe("the gate constant", () => {
  it("is 50", () => {
    expect(PROFILE_GATE_PERCENT).toBe(50);
  });
});
