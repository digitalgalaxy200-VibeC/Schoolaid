import { describe, it, expect } from "vitest";
import {
  PROFILE_GATE_PERCENT,
  RESULTS_GATE_PERCENT,
  assessProfile,
  editableProfileFields,
  profilePath,
} from "../profile-completion";
import { loadProfileSnapshot } from "../profile-snapshot";
import { fakeSupabase, fakeOk } from "@/lib/ai/__tests__/fake-supabase";

/**
 * TWO GATES, PINNED.
 *
 *   * the DASHBOARD opens at 40 for a student;
 *   * the RESULTS open at 60.
 *
 * The dashboard gate is about reaching a family: the student's own number OR the
 * guardian number the school took at registration. Results sit higher because a
 * result sheet is the child's academic record — it should carry a date of birth,
 * a photograph and someone to call in an emergency before it is handed over.
 *
 * Teachers and school admins keep their 50 gate: a member of staff must be
 * reachable AND have filled the small form.
 */

const teacherFull = {
  full_name: "Ada Obi",
  gender: "female",
  phone: "08031234567",
  contact_email: "ada@example.com",
};

const studentFull = {
  full_name: "Ada Obi",
  gender: "female",
  phone: "08031234567",
  contact_email: "ada@example.com",
  date_of_birth: "2015-04-02",
  emergency_contact: "08087654321",
  photo: "students/ada.png",
  parent_location: "Ikeja, Lagos",
  nationality: "Nigerian",
};

describe("student — the dashboard gate (40)", () => {
  it("opens on the name plus the school-held guardian number", () => {
    // The whole point: the school already has this number.
    const result = assessProfile("student", { full_name: "Ada Obi", phone: "08031234567" });
    expect(result.percent).toBe(PROFILE_GATE_PERCENT);
    expect(result.complete).toBe(true);
  });

  it("stays closed on a name alone", () => {
    const result = assessProfile("student", { full_name: "Ada Obi" });
    expect(result.percent).toBe(15);
    expect(result.complete).toBe(false);
  });

  it("stays closed on a name with the small optional fields but no contact", () => {
    const result = assessProfile("student", {
      full_name: "Ada Obi",
      gender: "female",
      date_of_birth: "2015-04-02",
      photo: "students/ada.png",
    });
    expect(result.percent).toBe(30);
    expect(result.complete).toBe(false);
  });

  it("scores everything that is filled and names what is not", () => {
    const result = assessProfile("student", studentFull);
    expect(result.percent).toBe(75);
    expect(result.missing.sort()).toEqual([
      "allergies",
      "blood_group",
      "health_notes",
      "parent_occupation",
      "religion",
    ]);
  });
});

describe("student — the results gate (60)", () => {
  it("keeps results locked at 40 even though the dashboard is open", () => {
    const result = assessProfile("student", { full_name: "Ada Obi", phone: "08031234567" });
    expect(result.complete).toBe(true);
    expect(result.resultsUnlocked).toBe(false);
    expect(result.resultsGate).toBe(RESULTS_GATE_PERCENT);
  });

  it("opens results once the record is real", () => {
    const result = assessProfile("student", {
      full_name: "Ada Obi",
      phone: "08031234567",
      date_of_birth: "2015-04-02",
      photo: "students/ada.png",
      gender: "female",
      contact_email: "ada@example.com",
    });
    expect(result.percent).toBe(60);
    expect(result.resultsUnlocked).toBe(true);
  });

  it("gives teachers and admins no results gate at all", () => {
    expect(assessProfile("teacher", teacherFull).resultsGate).toBeNull();
    expect(assessProfile("teacher", teacherFull).resultsUnlocked).toBe(true);
    expect(assessProfile("school_admin", { full_name: "X" }).resultsGate).toBeNull();
  });
});

describe("teacher — unchanged weighting", () => {
  it("scores a complete profile 100", () => {
    expect(assessProfile("teacher", teacherFull)).toMatchObject({ percent: 100, complete: true });
  });

  it("opens on the name plus one contact detail", () => {
    expect(assessProfile("teacher", { full_name: "Ada Obi", phone: "08031234567" })).toMatchObject({
      percent: 60,
      complete: true,
    });
    expect(
      assessProfile("teacher", { full_name: "Ada Obi", contact_email: "ada@example.com" }),
    ).toMatchObject({ percent: 60, complete: true });
  });

  it("does NOT unlock on a name and a gender alone", () => {
    const result = assessProfile("teacher", { full_name: "Ada Obi", gender: "female" });
    expect(result.percent).toBe(40);
    expect(result.complete).toBe(false);
    expect(result.missing.sort()).toEqual(["contact_email", "phone"]);
  });

  it("treats whitespace as empty, and never requires a well-formed value", () => {
    expect(assessProfile("teacher", { ...teacherFull, phone: "   " }).missing).toEqual(["phone"]);
    expect(assessProfile("teacher", { ...teacherFull, phone: "call the office" }).percent).toBe(100);
  });

  it("defaults a missing snapshot to zero, without throwing", () => {
    expect(assessProfile("teacher", {}).percent).toBe(0);
    expect(assessProfile("student", {})).toMatchObject({ percent: 0, complete: false });
  });
});

describe("who may write what", () => {
  it("lets a student fill every field they are scored on, except name and gender", () => {
    // A gate nobody can clear is not a gate, it is a wall.
    expect(editableProfileFields("student")).toEqual([
      "phone",
      "contact_email",
      "date_of_birth",
      "emergency_contact",
      "parent_location",
      "allergies",
      "blood_group",
      "health_notes",
      "nationality",
      "parent_occupation",
      "religion",
    ]);
    expect(editableProfileFields("student")).not.toContain("full_name");
    expect(editableProfileFields("student")).not.toContain("gender");
  });

  it("keeps the teacher and school-admin forms as they were", () => {
    expect(editableProfileFields("teacher")).toEqual([
      "full_name",
      "gender",
      "phone",
      "contact_email",
    ]);
    expect(editableProfileFields("school_admin")).toEqual(["full_name", "phone"]);
  });
});

describe("loadProfileSnapshot — the school's number counts", () => {
  const db = (profile: Record<string, unknown>, student: Record<string, unknown> | null) =>
    fakeSupabase({
      select: (spec) => {
        if (spec.table === "profiles") return fakeOk(profile);
        if (spec.table === "students") return fakeOk(student);
        return fakeOk(null);
      },
    });

  it("uses the guardian number when the student has none of their own", async () => {
    const fake = db(
      { full_name: "Ada Obi", email: "ada@school.ng", phone: null, recovery_email: null },
      { parent_phone: "08031234567" },
    );

    const loaded = await loadProfileSnapshot(fake.client, "profile-1", "student");

    expect(loaded?.snapshot.phone).toBe("08031234567");
    // Name (15) + guardian number (25) = exactly the dashboard gate, on data the
    // student never typed.
    expect(loaded?.assessment.percent).toBe(40);
    expect(loaded?.assessment.complete).toBe(true);
  });

  it("prefers the student's own number over the guardian's", async () => {
    const fake = db(
      { full_name: "Ada Obi", email: "ada@school.ng", phone: "08099999999", recovery_email: null },
      { parent_phone: "08031234567" },
    );

    const loaded = await loadProfileSnapshot(fake.client, "profile-1", "student");

    expect(loaded?.snapshot.phone).toBe("08099999999");
  });

  it("reports a student with no number at all as below the gate", async () => {
    const fake = db(
      { full_name: "Ada Obi", email: "ada@school.ng", phone: null, recovery_email: null },
      { parent_phone: null },
    );

    const loaded = await loadProfileSnapshot(fake.client, "profile-1", "student");

    expect(loaded?.snapshot.phone).toBeNull();
    expect(loaded?.assessment.complete).toBe(false);
  });

  it("falls back to the school admin's own number", async () => {
    const fake = fakeSupabase({
      select: (spec) => {
        if (spec.table === "profiles") {
          return fakeOk({ full_name: "Creamsville", email: "a@school.ng", phone: null, recovery_email: null });
        }
        if (spec.table === "school_admins") return fakeOk({ phone: "09011526026" });
        return fakeOk(null);
      },
    });

    const loaded = await loadProfileSnapshot(fake.client, "profile-1", "school_admin");

    expect(loaded?.snapshot.phone).toBe("09011526026");
    expect(loaded?.assessment.complete).toBe(true);
  });
});

describe("school admins represent the institution", () => {
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
    expect(assessProfile("school_admin", { full_name: "Creamsville School" })).toMatchObject({
      percent: 40,
      complete: false,
    });
  });

  it("ignores a gender value even if one is sent", () => {
    expect(assessProfile("school_admin", { ...teacherFull }).percent).toBe(100);
  });
});

describe("super admin", () => {
  it("is never gated and has no profile page", () => {
    expect(assessProfile("super_admin", {})).toMatchObject({
      percent: 100,
      complete: true,
      resultsUnlocked: true,
      resultsGate: null,
    });
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

describe("the gate constants", () => {
  it("are 40 for the dashboard and 60 for results", () => {
    expect(PROFILE_GATE_PERCENT).toBe(40);
    expect(RESULTS_GATE_PERCENT).toBe(60);
  });
});
