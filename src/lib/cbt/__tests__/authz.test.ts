import { describe, it, expect } from "vitest";
import {
  actorFromClaims,
  evaluateTeacherAssignment,
  decideStaffAccess,
  decideStudentAccess,
  type CbtActor,
  type AssessmentAlignment,
  type AssignmentRow,
} from "../authz";

// ── fixtures ────────────────────────────────────────────────────────────────

const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";

const studentActor: CbtActor = {
  profileId: "p-student",
  schoolId: SCHOOL_A,
  appRole: "student",
  impersonated: false,
  impersonatedBy: null,
  allClasses: false,
};

const teacherActor: CbtActor = { ...studentActor, profileId: "p-teacher", appRole: "teacher" };
const adminActor: CbtActor = { ...studentActor, profileId: "p-admin", appRole: "school_admin" };

/** A Super Admin impersonating a teacher — the session flag grants every class. */
const impersonatingTeacher: CbtActor = {
  ...teacherActor,
  profileId: "p-super",
  impersonated: true,
  impersonatedBy: "p-super",
  allClasses: true,
};

const assessment: AssessmentAlignment = {
  id: "asm-1",
  schoolId: SCHOOL_A,
  classId: "class-1",
  subjectId: "subject-maths",
  termId: "term-1",
  teacherId: "teacher-1",
  status: "published",
};

const assignmentFor = (
  over: Partial<AssignmentRow> = {},
): AssignmentRow => ({
  class_id: "class-1",
  subject_id: "subject-maths",
  academic_term_id: "term-1",
  ...over,
});

// ── actorFromClaims ─────────────────────────────────────────────────────────

describe("actorFromClaims", () => {
  it("reports no session when there are no claims", () => {
    expect(actorFromClaims(null)).toEqual({
      ok: false,
      reason: "no_session",
      role: null,
    });
  });

  it("refuses a platform Super Admin session as a CBT actor", () => {
    // The important case: a super_admin session with a school_id must NOT become
    // a school actor. Impersonation is the sanctioned route, and it issues a
    // school-scoped token instead.
    expect(
      actorFromClaims({ sub: "p-super", role: "super_admin", school_id: SCHOOL_A }),
    ).toEqual({ ok: false, reason: "no_school_scope", role: "super_admin" });
  });

  it("refuses a session with no school scope", () => {
    expect(actorFromClaims({ sub: "p1", role: "teacher" })).toEqual({
      ok: false,
      reason: "no_school_scope",
      role: "teacher",
    });
  });

  it("refuses claims with no subject", () => {
    expect(actorFromClaims({ role: "teacher", school_id: SCHOOL_A })).toEqual({
      ok: false,
      reason: "unsupported_role",
      role: "teacher",
    });
  });

  it("refuses an unknown role", () => {
    expect(
      actorFromClaims({ sub: "p1", role: "parent", school_id: SCHOOL_A }),
    ).toEqual({ ok: false, reason: "unsupported_role", role: "parent" });
  });

  it("maps a student session", () => {
    const result = actorFromClaims({
      sub: "p-student",
      role: "student",
      school_id: SCHOOL_A,
    });
    expect(result).toEqual({
      ok: true,
      actor: {
        profileId: "p-student",
        schoolId: SCHOOL_A,
        appRole: "student",
        impersonated: false,
        impersonatedBy: null,
        allClasses: false,
      },
    });
  });

  it("carries the all_classes flag for a teacher", () => {
    const result = actorFromClaims({
      sub: "p-teacher",
      role: "teacher",
      school_id: SCHOOL_A,
      all_classes: true,
    });
    expect(result.ok && result.actor.allClasses).toBe(true);
  });

  it("records impersonation provenance without changing the app role", () => {
    const result = actorFromClaims({
      sub: "p-super",
      role: "school_admin",
      school_id: SCHOOL_A,
      impersonated: true,
      impersonated_by: "p-super",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actor.impersonated).toBe(true);
    expect(result.actor.impersonatedBy).toBe("p-super");
    // Narrowing to the target school's role — never super_admin.
    expect(result.actor.appRole).toBe("school_admin");
  });

  it("does not treat a truthy-but-not-true all_classes as a grant", () => {
    const result = actorFromClaims({
      sub: "p-teacher",
      role: "teacher",
      school_id: SCHOOL_A,
      all_classes: "yes",
    });
    expect(result.ok && result.actor.allClasses).toBe(false);
  });
});

// ── evaluateTeacherAssignment ───────────────────────────────────────────────

describe("evaluateTeacherAssignment", () => {
  it("matches an exact class + subject + term assignment", () => {
    expect(evaluateTeacherAssignment([assignmentFor()], assessment)).toBe(true);
  });

  it("grants nothing when the teacher has no assignments", () => {
    expect(evaluateTeacherAssignment([], assessment)).toBe(false);
  });

  it("does not match a different class", () => {
    expect(
      evaluateTeacherAssignment([assignmentFor({ class_id: "class-2" })], assessment),
    ).toBe(false);
  });

  it("does not match a different subject", () => {
    expect(
      evaluateTeacherAssignment(
        [assignmentFor({ subject_id: "subject-english" })],
        assessment,
      ),
    ).toBe(false);
  });

  it("does not match an explicit assignment for another term", () => {
    expect(
      evaluateTeacherAssignment(
        [assignmentFor({ academic_term_id: "term-2" })],
        assessment,
      ),
    ).toBe(false);
  });

  it("treats a term-agnostic assignment as covering every term", () => {
    expect(
      evaluateTeacherAssignment(
        [assignmentFor({ academic_term_id: null })],
        assessment,
      ),
    ).toBe(true);
  });

  it("accepts a class-level assignment when the assessment names no subject", () => {
    expect(
      evaluateTeacherAssignment(
        [assignmentFor({ subject_id: null })],
        { ...assessment, subjectId: null },
      ),
    ).toBe(true);
  });

  it("still requires the subject when the assessment names one", () => {
    expect(
      evaluateTeacherAssignment(
        [assignmentFor({ subject_id: null })],
        assessment,
      ),
    ).toBe(false);
  });

  it("matches when any one of several rows covers the assessment", () => {
    const rows = [
      assignmentFor({ class_id: "class-9" }),
      assignmentFor({ subject_id: "subject-english" }),
      assignmentFor(),
    ];
    expect(evaluateTeacherAssignment(rows, assessment)).toBe(true);
  });
});

// ── decideStaffAccess ───────────────────────────────────────────────────────

describe("decideStaffAccess", () => {
  it("allows a school admin", () => {
    expect(decideStaffAccess(adminActor, assessment, false)).toEqual({ allowed: true });
  });

  it("allows an assigned teacher", () => {
    expect(decideStaffAccess(teacherActor, assessment, true)).toEqual({ allowed: true });
  });

  it("refuses an unassigned teacher", () => {
    const d = decideStaffAccess(teacherActor, assessment, false);
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/not assigned/);
  });

  it("allows an all_classes teacher without an assignment row", () => {
    expect(
      decideStaffAccess({ ...teacherActor, allClasses: true }, assessment, false),
    ).toEqual({ allowed: true });
  });

  it("allows an impersonating Super Admin acting as a teacher", () => {
    expect(decideStaffAccess(impersonatingTeacher, assessment, false)).toEqual({
      allowed: true,
    });
  });

  it("refuses any staff actor from another school", () => {
    const foreign = { ...adminActor, schoolId: SCHOOL_B };
    const d = decideStaffAccess(foreign, assessment, true);
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/different school/);
  });

  it("refuses an impersonating admin re-targeted at another school", () => {
    // Impersonation narrows to one school. Re-pointing the actor's school at a
    // second school must not be honoured, even for a Super Admin.
    const retargeted: CbtActor = {
      ...adminActor,
      schoolId: SCHOOL_B,
      impersonated: true,
      impersonatedBy: "p-super",
      allClasses: true,
    };
    expect(decideStaffAccess(retargeted, assessment, true).allowed).toBe(false);
  });

  it("refuses a student", () => {
    const d = decideStaffAccess(studentActor, assessment, true);
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/not staff/);
  });
});

// ── decideStudentAccess ─────────────────────────────────────────────────────

describe("decideStudentAccess", () => {
  const student = { studentId: "s-1", classId: "class-1" };

  it("allows a student in the assessment's class", () => {
    expect(decideStudentAccess(studentActor, assessment, student, false)).toEqual({
      allowed: true,
    });
  });

  it("allows a student enrolled for the term even when class_id differs", () => {
    expect(
      decideStudentAccess(
        studentActor,
        assessment,
        { studentId: "s-1", classId: "class-9" },
        true,
      ),
    ).toEqual({ allowed: true });
  });

  it("refuses a student in another class with no enrolment", () => {
    const d = decideStudentAccess(
      studentActor,
      assessment,
      { studentId: "s-1", classId: "class-9" },
      false,
    );
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/not enrolled/);
  });

  it("refuses an unpublished assessment even for an enrolled student", () => {
    const d = decideStudentAccess(
      studentActor,
      { ...assessment, status: "draft" },
      student,
      true,
    );
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/not published/);
  });

  it("refuses a session with no matching student record", () => {
    const d = decideStudentAccess(studentActor, assessment, null, false);
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/no student record/);
  });

  it("refuses a student from another school", () => {
    const foreign = { ...studentActor, schoolId: SCHOOL_B };
    expect(decideStudentAccess(foreign, assessment, student, true).allowed).toBe(false);
  });

  it("refuses a teacher session even with a student record present", () => {
    const d = decideStudentAccess(teacherActor, assessment, student, true);
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/not a student session/);
  });

  it("refuses a school admin session", () => {
    expect(decideStudentAccess(adminActor, assessment, student, true).allowed).toBe(false);
  });
});
