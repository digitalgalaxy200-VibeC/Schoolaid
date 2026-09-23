import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { originAllowed } from "@/lib/api-auth";
import { readSession } from "@/lib/school-auth";
import { createTenantScopedClient } from "./scoped-client";

/**
 * The CBT authorization guard (reusability item R3).
 *
 * WHY THIS EXISTS
 * ---------------
 * Tenant isolation has three layers, and each one answers a different question:
 *
 *   RLS (migrations 045/046/047)  "may this request see any row of this school?"
 *   structural FKs (047)          "can this row reference another school at all?"
 *   this guard                    "may THIS actor, in THIS school, touch THIS
 *                                  assessment / attempt / question?"
 *
 * RLS is deliberately coarse for CBT content: it separates a school's staff from
 * its students and blocks every other school. It cannot reasonably express
 * "this teacher teaches Mathematics to Basic 2 in term 1" — doing so would mean a
 * policy that subqueries the assignment tables on every row, with real
 * performance and recursion cost. That finer question is answered here, once,
 * for every CBT route, instead of being re-implemented per route.
 *
 * Everything in this file is therefore about GRANULARITY, not tenancy. Tenancy
 * is not re-checked here as a substitute for RLS — it is checked again as
 * defence in depth, because the service-role client bypasses RLS and a
 * misconfigured scoped client must not become a cross-school read.
 *
 * DESIGN CONTRACT
 *   - `schoolId` always comes from the verified session, never from a request.
 *   - Failures are explicit and typed; nothing here fails open.
 *   - The pure decision functions take no database, so they are unit-testable
 *     without a live Postgres.
 *   - An impersonated session is a normal school-scoped actor. Impersonation
 *     narrows a Super Admin to one school; it never widens a school user.
 */

export type CbtAppRole = "student" | "teacher" | "school_admin";

export type CbtActor = {
  /** `profiles.id` — the `sub` claim. */
  profileId: string;
  schoolId: string;
  appRole: CbtAppRole;
  /** True when this session was issued by Super Admin impersonation. */
  impersonated: boolean;
  /** The originating Super Admin, for audit. Null for a normal login. */
  impersonatedBy: string | null;
  /** Session flag: this teacher covers every class in the school. */
  allClasses: boolean;
};

export type ActorResolution =
  | { ok: true; actor: CbtActor }
  | {
      ok: false;
      reason: "no_session" | "unsupported_role" | "no_school_scope";
      role: string | null;
    };

/**
 * Maps verified session claims to a CBT actor. Pure — no cookies, no database.
 *
 * A Super Admin session is NOT a CBT actor. CBT is school-scoped, and a platform
 * session has no school of its own; the Super Admin enters a school through
 * impersonation (which issues a school-scoped token) and is a `school_admin`
 * there. Refusing here is what stops a platform session from being treated as a
 * member of an arbitrary school.
 */
export function actorFromClaims(
  claims: Record<string, unknown> | null,
): ActorResolution {
  if (!claims) return { ok: false, reason: "no_session", role: null };

  const role = typeof claims.role === "string" ? claims.role : null;
  const profileId = typeof claims.sub === "string" ? claims.sub : null;
  const schoolId = typeof claims.school_id === "string" ? claims.school_id : null;

  if (!role || !profileId) {
    return { ok: false, reason: "unsupported_role", role };
  }

  if (role === "super_admin") {
    return { ok: false, reason: "no_school_scope", role };
  }

  if (!schoolId) {
    return { ok: false, reason: "no_school_scope", role };
  }

  if (role !== "student" && role !== "teacher" && role !== "school_admin") {
    return { ok: false, reason: "unsupported_role", role };
  }

  return {
    ok: true,
    actor: {
      profileId,
      schoolId,
      appRole: role,
      impersonated: claims.impersonated === true,
      impersonatedBy:
        typeof claims.impersonated_by === "string" ? claims.impersonated_by : null,
      allClasses: claims.all_classes === true,
    },
  };
}

export type Gate =
  | { ok: true; actor: CbtActor }
  | { ok: false; response: NextResponse };

/**
 * Route entry point: CSRF check, then session verification, then actor mapping.
 *
 * Reads the cookie directly rather than calling the four role verifiers, so a
 * non-matching role cannot be mistaken for an authentication failure and no
 * spurious mismatch is logged.
 */
export async function requireCbtActor(request: Request): Promise<Gate> {
  if (!originAllowed(request)) {
    console.warn("[cbt/authz] rejected: request origin does not match host");
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cross-origin request rejected" },
        { status: 403 },
      ),
    };
  }

  const resolved = actorFromClaims(await readSession());
  if (!resolved.ok) {
    const status = resolved.reason === "no_session" ? 401 : 403;
    const message =
      resolved.reason === "no_session"
        ? "Not signed in"
        : resolved.reason === "no_school_scope"
          ? "This session is not scoped to a school"
          : `Role '${resolved.role}' has no CBT access`;
    return { ok: false, response: NextResponse.json({ error: message }, { status }) };
  }

  return { ok: true, actor: resolved.actor };
}

// ────────────────────────────────────────────────────────────────────────────
// Pure decisions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Staff are the only CBT authors. A student session is never staff, and an
 * impersonated student session is still a student.
 */
export function isCbtStaff(actor: CbtActor): boolean {
  return actor.appRole === "teacher" || actor.appRole === "school_admin";
}

/**
 * Opens the tenant-scoped client for an actor. Throws rather than falling back,
 * for the reasons in `scoped-client.ts`.
 *
 * Exported so non-assessment CBT routes (the question bank, for one) can reach
 * the database without each one re-deriving the client arguments — and so that
 * there is exactly one place where a CBT route could accidentally be handed the
 * service-role client instead. There is no such place.
 */
export async function openCbtClient(actor: CbtActor): Promise<SupabaseClient> {
  return createTenantScopedClient({
    userId: actor.profileId,
    schoolId: actor.schoolId,
    appRole: actor.appRole,
  });
}

export type AssessmentAlignment = {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string | null;
  termId: string | null;
  teacherId: string | null;
  status: string;
};

export type Decision = { allowed: true } | { allowed: false; reason: string };

/** One `teacher_subjects` row, reduced to what assignment logic needs. */
export type AssignmentRow = {
  class_id: string;
  subject_id: string | null;
  academic_term_id: string | null;
};

/**
 * Whether any assignment row covers this assessment.
 *
 * Deliberately tolerant in two places, both of which default to *granting*
 * access based on explicit configuration rather than inference:
 *
 *   - a term-agnostic assignment (`academic_term_id IS NULL`) covers every term;
 *   - when the assessment names no subject, a class-level assignment is enough.
 *
 * It never widens beyond an assignment the school actually created, and it
 * deliberately does NOT treat a form teacher (`class_teachers`) as implicitly
 * assigned to every subject — that would be inventing a permission the school
 * never granted.
 */
export function evaluateTeacherAssignment(
  rows: AssignmentRow[],
  assessment: AssessmentAlignment,
): boolean {
  return rows.some((row) => {
    if (row.class_id !== assessment.classId) return false;
    if (assessment.subjectId && row.subject_id !== assessment.subjectId) return false;
    if (
      assessment.termId &&
      row.academic_term_id &&
      row.academic_term_id !== assessment.termId
    ) {
      return false;
    }
    return true;
  });
}

/** Staff access to an assessment's content, attempts and results. */
export function decideStaffAccess(
  actor: CbtActor,
  assessment: AssessmentAlignment,
  isAssigned: boolean,
): Decision {
  if (actor.schoolId !== assessment.schoolId) {
    return { allowed: false, reason: "assessment belongs to a different school" };
  }

  if (actor.appRole === "school_admin") return { allowed: true };

  if (actor.appRole !== "teacher") {
    return {
      allowed: false,
      reason: `role '${actor.appRole}' is not staff for CBT content`,
    };
  }

  // Set for a teacher session flagged all_classes, including a Super Admin
  // impersonating a teacher — which is exactly the intended "see every class in
  // this school" behaviour.
  if (actor.allClasses) return { allowed: true };

  return isAssigned
    ? { allowed: true }
    : { allowed: false, reason: "teacher is not assigned to this class and subject" };
}

/** A student's access to take (or read) an assessment. */
export function decideStudentAccess(
  actor: CbtActor,
  assessment: AssessmentAlignment,
  student: { studentId: string; classId: string | null } | null,
  hasActiveEnrolment: boolean,
): Decision {
  if (actor.appRole !== "student") {
    return { allowed: false, reason: "not a student session" };
  }
  if (actor.schoolId !== assessment.schoolId) {
    return { allowed: false, reason: "assessment belongs to a different school" };
  }
  if (assessment.status !== "published") {
    return { allowed: false, reason: "assessment is not published" };
  }
  if (!student) {
    return { allowed: false, reason: "no student record for this account in this school" };
  }
  if (student.classId === assessment.classId) return { allowed: true };
  if (hasActiveEnrolment) return { allowed: true };

  return { allowed: false, reason: "student is not enrolled in the assessment's class" };
}

// ────────────────────────────────────────────────────────────────────────────
// Database-backed lookups
// ────────────────────────────────────────────────────────────────────────────

/**
 * The `teachers.id` row for a profile in this school, or null.
 *
 * `teachers.id` is NOT `profiles.id`, so anything that reasons about
 * `teacher_subjects.teacher_id` has to resolve through `teachers.profile_id`
 * first. Exported rather than only living inside the lookups, so route code and
 * the guard cannot end up disagreeing about which id a teacher has.
 */
export async function getTeacherIdForProfile(
  supabase: SupabaseClient,
  schoolId: string,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", profileId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

export type CbtLookups = {
  getAssessment(assessmentId: string): Promise<AssessmentAlignment | null>;
  getTeacherIdForProfile(profileId: string): Promise<string | null>;
  listTeacherAssignments(teacherId: string): Promise<AssignmentRow[]>;
  getStudentForProfile(
    profileId: string,
  ): Promise<{ studentId: string; classId: string | null } | null>;
  hasActiveEnrolment(studentId: string, classId: string): Promise<boolean>;
};

/**
 * Lookups bound to one school. Every query carries an explicit `school_id`
 * filter even though the client is already tenant-scoped: if the client is ever
 * misconfigured, the filter still holds. Two independent barriers to a
 * cross-school read, neither of which relies on the caller remembering.
 */
export function createCbtLookups(
  supabase: SupabaseClient,
  schoolId: string,
): CbtLookups {
  return {
    async getAssessment(assessmentId) {
      const { data } = await supabase
        .from("cbt_assessments")
        .select("id, school_id, class_id, subject_id, term_id, teacher_id, status")
        .eq("id", assessmentId)
        .eq("school_id", schoolId)
        .maybeSingle();

      if (!data) return null;

      return {
        id: data.id,
        schoolId: data.school_id,
        classId: data.class_id,
        subjectId: data.subject_id ?? null,
        termId: data.term_id ?? null,
        teacherId: data.teacher_id ?? null,
        status: data.status,
      };
    },

    async getTeacherIdForProfile(profileId) {
      return getTeacherIdForProfile(supabase, schoolId, profileId);
    },

    async listTeacherAssignments(teacherId) {
      const { data } = await supabase
        .from("teacher_subjects")
        .select("class_id, subject_id, academic_term_id")
        .eq("school_id", schoolId)
        .eq("teacher_id", teacherId)
        .eq("is_active", true);
      return (data ?? []) as AssignmentRow[];
    },

    async getStudentForProfile(profileId) {
      const { data } = await supabase
        .from("students")
        .select("id, class_id")
        .eq("profile_id", profileId)
        .eq("school_id", schoolId)
        .maybeSingle();
      return data ? { studentId: data.id, classId: data.class_id ?? null } : null;
    },

    async hasActiveEnrolment(studentId, classId) {
      const { data } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId)
        .eq("class_id", classId)
        .eq("school_id", schoolId)
        .eq("status", "active")
        .maybeSingle();
      return Boolean(data);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Facade
// ────────────────────────────────────────────────────────────────────────────

export type AssessmentAccess =
  | { ok: true; actor: CbtActor; assessment: AssessmentAlignment }
  | { ok: false; status: number; reason: string };

/**
 * The single call a CBT route needs: open a tenant-scoped client and decide
 * whether this actor may act on this assessment in the requested capacity.
 *
 * `intent: "student"` is for taking an assessment; `"staff"` is for authoring,
 * marking, marking-up and everything else. A student session never satisfies
 * `"staff"` and a staff session never satisfies `"student"`.
 */
export async function authorizeCbtAssessment(args: {
  actor: CbtActor;
  assessmentId: string;
  intent: "staff" | "student";
}): Promise<AssessmentAccess> {
  const { actor, assessmentId, intent } = args;

  let supabase: SupabaseClient;
  try {
    supabase = await openCbtClient(actor);
  } catch (err) {
    // The scoped client fails closed when its signing secret is absent. Surface
    // it as a server error rather than falling back to the service-role client,
    // which would silently disable RLS for the whole CBT surface.
    console.error("[cbt/authz] tenant-scoped client unavailable:", err);
    return {
      ok: false,
      status: 503,
      reason: "CBT tenant-scoped access is not configured",
    };
  }

  const lookups = createCbtLookups(supabase, actor.schoolId);
  const assessment = await lookups.getAssessment(assessmentId);

  if (!assessment) {
    // Same answer for "does not exist" and "belongs to another school": the
    // caller learns nothing about another tenant's ids.
    return { ok: false, status: 404, reason: "assessment not found" };
  }

  const decision =
    intent === "student"
      ? await authorizeStudent(actor, assessment, lookups)
      : decideStaffAccess(
          actor,
          assessment,
          await isTeacherAssigned(actor, assessment, lookups),
        );

  if (!decision.allowed) {
    return { ok: false, status: 403, reason: decision.reason };
  }

  return { ok: true, actor, assessment };
}

/**
 * Resolves class membership for a student, querying enrolment only when class
 * membership alone did not already decide it.
 */
async function authorizeStudent(
  actor: CbtActor,
  assessment: AssessmentAlignment,
  lookups: CbtLookups,
): Promise<Decision> {
  if (actor.appRole !== "student") {
    return { allowed: false, reason: "not a student session" };
  }

  const student = await lookups.getStudentForProfile(actor.profileId);

  let enrolled = false;
  if (student && student.classId !== assessment.classId) {
    enrolled = await lookups.hasActiveEnrolment(student.studentId, assessment.classId);
  }

  return decideStudentAccess(actor, assessment, student, enrolled);
}

async function isTeacherAssigned(
  actor: CbtActor,
  assessment: AssessmentAlignment,
  lookups: CbtLookups,
): Promise<boolean> {
  if (actor.appRole !== "teacher") return false;
  if (actor.allClasses) return true;

  const teacherId = await lookups.getTeacherIdForProfile(actor.profileId);
  if (!teacherId) return false;

  return evaluateTeacherAssignment(
    await lookups.listTeacherAssignments(teacherId),
    assessment,
  );
}
