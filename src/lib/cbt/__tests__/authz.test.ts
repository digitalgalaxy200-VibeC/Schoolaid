import { describe, it, expect } from "vitest";
import {
  actorFromClaims,
  evaluateTeacherAssignment,
  decideStaffAccess,
  decideStudentAccess,
  questionContextAllows,
  classTeacherCoverage,
  blockingAssignments,
  coverageCoversAssessment,
  type CbtActor,
  type AssessmentAlignment,
  type AssignmentRow,
  type QuestionContexts,
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

describe("questionContextAllows", () => {
  const pairs: QuestionContexts = {
    kind: "pairs",
    pairs: [
      { classId: "class-1", subjectId: "subject-1" },
      { classId: "class-1", subjectId: "subject-2" },
      { classId: "class-2", subjectId: "subject-1" },
    ],
  };

  it("lets an unrestricted actor (admin / all_classes) anywhere", () => {
    expect(questionContextAllows({ kind: "all" }, "class-9", "subject-9")).toBe(true);
    expect(questionContextAllows({ kind: "all" }, null, null)).toBe(true);
  });

  it("allows exactly the assigned class+subject pairs", () => {
    expect(questionContextAllows(pairs, "class-1", "subject-1")).toBe(true);
    expect(questionContextAllows(pairs, "class-1", "subject-2")).toBe(true);
    expect(questionContextAllows(pairs, "class-2", "subject-1")).toBe(true);
  });

  it("refuses a cross-pair combination the teacher does not teach", () => {
    // class-2 + subject-2 is NOT one of the pairs.
    expect(questionContextAllows(pairs, "class-2", "subject-2")).toBe(false);
  });

  it("refuses another class's questions entirely", () => {
    expect(questionContextAllows(pairs, "class-9", "subject-1")).toBe(false);
  });

  it("refuses unscoped questions for a restricted teacher", () => {
    // Legacy questions with no class/subject must not appear automatically.
    expect(questionContextAllows(pairs, null, null)).toBe(false);
    expect(questionContextAllows(pairs, "class-1", null)).toBe(false);
  });

  it("allows nothing for an actor with no assignments", () => {
    const empty: QuestionContexts = { kind: "pairs", pairs: [] };
    expect(questionContextAllows(empty, "class-1", "subject-1")).toBe(false);
  });
});

describe("classTeacherCoverage", () => {
  const classSubjects = [
    { classId: "class-1", subjectId: "subject-1" },
    { classId: "class-1", subjectId: "subject-2" },
    { classId: "class-1", subjectId: "subject-3" },
    { classId: "class-2", subjectId: "subject-1" },
  ];

  it("covers every active subject of the teacher's own class", () => {
    const coverage = classTeacherCoverage({
      classIds: ["class-1"],
      classSubjects,
      ownedByOtherTeachers: [],
    });
    expect(coverage).toEqual([
      { classId: "class-1", subjectId: "subject-1" },
      { classId: "class-1", subjectId: "subject-2" },
      { classId: "class-1", subjectId: "subject-3" },
    ]);
  });

  it("excludes a subject explicitly assigned to another teacher", () => {
    const coverage = classTeacherCoverage({
      classIds: ["class-1"],
      classSubjects,
      ownedByOtherTeachers: [{ classId: "class-1", subjectId: "subject-2" }],
    });
    expect(coverage.map((p) => p.subjectId)).toEqual(["subject-1", "subject-3"]);
  });

  it("never reaches into classes the teacher does not lead", () => {
    const coverage = classTeacherCoverage({
      classIds: ["class-1"],
      classSubjects,
      ownedByOtherTeachers: [],
    });
    expect(coverage.some((p) => p.classId === "class-2")).toBe(false);
  });

  it("deduplicates repeated class_subjects rows", () => {
    const coverage = classTeacherCoverage({
      classIds: ["class-1"],
      classSubjects: [
        { classId: "class-1", subjectId: "subject-1" },
        { classId: "class-1", subjectId: "subject-1" },
      ],
      ownedByOtherTeachers: [],
    });
    expect(coverage).toHaveLength(1);
  });
});

describe("blockingAssignments", () => {
  const self = "teacher-self";

  it("counts a subject held by another ACTIVE teacher as taken away", () => {
    expect(
      blockingAssignments({
        rows: [{ classId: "class-1", subjectId: "subject-2", teacherId: "teacher-other" }],
        teacherId: self,
        activeTeacherIds: new Set(["teacher-other"]),
      }),
    ).toEqual([{ classId: "class-1", subjectId: "subject-2" }]);
  });

  it("treats a DEACTIVATED teacher's assignment as vacant, not as taken away", () => {
    expect(
      blockingAssignments({
        rows: [{ classId: "class-1", subjectId: "subject-2", teacherId: "teacher-dead" }],
        teacherId: self,
        activeTeacherIds: new Set(),
      }),
    ).toEqual([]);
  });

  it("treats an assignment to a missing teacher row as vacant too", () => {
    expect(
      blockingAssignments({
        rows: [{ classId: "class-1", subjectId: "subject-2", teacherId: "teacher-ghost" }],
        teacherId: self,
        activeTeacherIds: new Set(["teacher-other"]),
      }),
    ).toEqual([]);
  });

  it("never blocks the class teacher with their own row", () => {
    expect(
      blockingAssignments({
        rows: [{ classId: "class-1", subjectId: "subject-1", teacherId: self }],
        teacherId: self,
        activeTeacherIds: new Set([self]),
      }),
    ).toEqual([]);
  });

  it("skips rows missing an id and deduplicates repeats", () => {
    expect(
      blockingAssignments({
        rows: [
          { classId: null, subjectId: "subject-2", teacherId: "teacher-other" },
          { classId: "class-1", subjectId: null, teacherId: "teacher-other" },
          { classId: "class-1", subjectId: "subject-2", teacherId: null },
          { classId: "class-1", subjectId: "subject-2", teacherId: "teacher-other" },
          { classId: "class-1", subjectId: "subject-2", teacherId: "teacher-other" },
        ],
        teacherId: self,
        activeTeacherIds: new Set(["teacher-other"]),
      }),
    ).toEqual([{ classId: "class-1", subjectId: "subject-2" }]);
  });
});

describe("coverageCoversAssessment", () => {
  const coverage = [
    { classId: "class-1", subjectId: "subject-1" },
    { classId: "class-1", subjectId: "subject-2" },
  ];

  it("allows an exact class + subject pair", () => {
    expect(
      coverageCoversAssessment(coverage, { classId: "class-1", subjectId: "subject-1" }),
    ).toBe(true);
  });

  it("refuses a subject the class does not cover", () => {
    expect(
      coverageCoversAssessment(coverage, { classId: "class-1", subjectId: "subject-9" }),
    ).toBe(false);
  });

  it("refuses another class entirely — no cross-pair reach", () => {
    expect(
      coverageCoversAssessment(coverage, { classId: "class-9", subjectId: "subject-1" }),
    ).toBe(false);
  });

  it("accepts a class-level assessment when any subject of the class is covered", () => {
    expect(
      coverageCoversAssessment(coverage, { classId: "class-1", subjectId: null }),
    ).toBe(true);
  });

  it("refuses everything when the teacher covers nothing", () => {
    expect(coverageCoversAssessment([], { classId: "class-1", subjectId: null })).toBe(false);
  });
});
