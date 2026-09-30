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
// Question authoring context
// ────────────────────────────────────────────────────────────────────────────

/**
 * Which class+subject pairs may this actor author questions in?
 *
 * `all` is a school admin (or an `all_classes` session) — the whole school.
 *
 * `pairs` is a teacher's real reach:
 *
 *   1. every active `teacher_subjects` row — subjects explicitly given to
 *      them;
 *   2. PLUS, as a CLASS TEACHER (`class_teachers`), every active subject of
 *      their class — because the class teacher runs the class — EXCEPT a
 *      subject explicitly assigned to a DIFFERENT teacher, which belongs to
 *      that teacher. A vacant assignment (`teacher_id` NULL) — or one whose
 *      teacher account has been deactivated — is not "given to another
 *      teacher", so the class teacher covers it.
 *
 * The subject the school gave away stays out of the class teacher's bank; the
 * rest is theirs.
 */
export type QuestionContexts =
  | { kind: "all" }
  | { kind: "pairs"; pairs: { classId: string; subjectId: string }[] };

/** Pure: is this class+subject inside the actor's authoring context? */
export function questionContextAllows(
  contexts: QuestionContexts,
  classId: string | null,
  subjectId: string | null,
): boolean {
  if (contexts.kind === "all") return true;
  if (!classId || !subjectId) return false;
  return contexts.pairs.some((p) => p.classId === classId && p.subjectId === subjectId);
}

/**
 * Pure: the subjects a class teacher covers.
 *
 * Their class's active subjects, minus any subject the school has explicitly
 * assigned to another teacher. Exported so the rule is unit-tested without a
 * database.
 */
export function classTeacherCoverage(input: {
  classIds: string[];
  classSubjects: { classId: string; subjectId: string }[];
  /** Active assignments held by a DIFFERENT teacher. */
  ownedByOtherTeachers: { classId: string; subjectId: string }[];
}): { classId: string; subjectId: string }[] {
  const own = new Set(input.classIds);
  const blocked = new Set(
    input.ownedByOtherTeachers.map((p) => `${p.classId}:${p.subjectId}`),
  );

  const seen = new Set<string>();
  const out: { classId: string; subjectId: string }[] = [];
  for (const subject of input.classSubjects) {
    if (!own.has(subject.classId)) continue;
    const key = `${subject.classId}:${subject.subjectId}`;
    if (blocked.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ classId: subject.classId, subjectId: subject.subjectId });
  }
  return out;
}

/** One class + subject pair. */
export type TeachingPair = { classId: string; subjectId: string };

/**
 * Pure: which explicit assignments belong to OTHER teachers who still hold an
 * active account.
 *
 * A claim on a subject only holds while its teacher can act. Rows pointing at
 * a deactivated teacher — or at no teacher row at all — are stale: treating
 * them as "given to another teacher" would let a dead account hold a subject
 * away from the class teacher who actually runs the class. Excluding them lets
 * the subject fall back to class-teacher coverage, or stay vacant.
 */
export function blockingAssignments(input: {
  rows: { classId: string | null; subjectId: string | null; teacherId: string | null }[];
  /** The class teacher whose coverage is being computed. */
  teacherId: string;
  /** Teacher ids whose account is still active in this school. */
  activeTeacherIds: Set<string>;
}): TeachingPair[] {
  const out: TeachingPair[] = [];
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (typeof row.classId !== "string" || !row.classId) continue;
    if (typeof row.subjectId !== "string" || !row.subjectId) continue;
    if (typeof row.teacherId !== "string") continue;
    if (row.teacherId === input.teacherId) continue;
    if (!input.activeTeacherIds.has(row.teacherId)) continue;
    addPair(out, seen, row.classId, row.subjectId);
  }
  return out;
}

/**
 * Pure: does class-teacher coverage include this assessment?
 *
 * Pairs are exact, exactly as in the question bank. When the assessment names
 * no subject, any covered subject of the class suffices — mirroring
 * `evaluateTeacherAssignment`'s class-level tolerance for explicit rows.
 */
export function coverageCoversAssessment(
  coverage: TeachingPair[],
  assessment: Pick<AssessmentAlignment, "classId" | "subjectId">,
): boolean {
  return coverage.some(
    (p) =>
      p.classId === assessment.classId &&
      (assessment.subjectId === null || p.subjectId === assessment.subjectId),
  );
}

/** Dedupe-and-append for pair lists, skipping rows missing an id. */
function addPair(
  out: TeachingPair[],
  seen: Set<string>,
  classId: unknown,
  subjectId: unknown,
): void {
  if (typeof classId !== "string" || !classId) return;
  if (typeof subjectId !== "string" || !subjectId) return;
  const key = `${classId}:${subjectId}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ classId, subjectId });
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

/**
 * Which of these teacher ids still hold an active account in the school.
 *
 * "Active" lives on `profiles.is_active` — `teachers` has no flag of its own —
 * so ids resolve through `teachers.profile_id`. An id that fails either step
 * is an invisible teacher: its assignment rows must never block anyone.
 */
async function activeTeacherIdsIn(
  supabase: SupabaseClient,
  schoolId: string,
  teacherIds: string[],
): Promise<Set<string>> {
  if (teacherIds.length === 0) return new Set();

  const { data: teacherRows } = await supabase
    .from("teachers")
    .select("id, profile_id")
    .eq("school_id", schoolId)
    .in("id", teacherIds);
  if (!teacherRows || teacherRows.length === 0) return new Set();

  const profileIds = [
    ...new Set(teacherRows.map((t) => t.profile_id as string).filter(Boolean)),
  ];

  const { data: activeProfiles } = await supabase
    .from("profiles")
    .select("id")
    .in("id", profileIds)
    .eq("is_active", true);

  const active = new Set((activeProfiles ?? []).map((p) => p.id as string));
  return new Set(
    teacherRows
      .filter((t) => active.has(t.profile_id as string))
      .map((t) => t.id as string),
  );
}

/**
 * The teacher's reach, in two halves: their own explicit assignments, and the
 * subjects they cover as class teacher (`classTeacherCoverage` over the
 * school's active class subjects, minus subjects held by another ACTIVE
 * teacher — a deactivated teacher's stale rows never block).
 *
 * The halves stay separate because callers weigh them differently: the
 * question bank unions them, while assessment access adds only the coverage
 * half, keeping the explicit half's term tolerance (`evaluateTeacherAssignment`).
 */
async function resolveTeachingPairs(
  supabase: SupabaseClient,
  schoolId: string,
  teacherId: string,
): Promise<{ own: TeachingPair[]; covered: TeachingPair[] }> {
  const [assignments, classTeacherRows] = await Promise.all([
    supabase
      .from("teacher_subjects")
      .select("class_id, subject_id")
      .eq("school_id", schoolId)
      .eq("teacher_id", teacherId)
      .eq("is_active", true),
    supabase
      .from("class_teachers")
      .select("class_id")
      .eq("school_id", schoolId)
      .eq("teacher_id", teacherId)
      .eq("is_active", true),
  ]);

  const own: TeachingPair[] = [];
  const seenOwn = new Set<string>();
  for (const row of assignments.data ?? []) {
    addPair(own, seenOwn, row.class_id, row.subject_id);
  }

  const classIds = [
    ...new Set(
      (classTeacherRows.data ?? [])
        .map((r) => r.class_id as string | null)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const covered: TeachingPair[] = [];
  if (classIds.length > 0) {
    const [{ data: classSubjectRows }, { data: explicitRows }] = await Promise.all([
      supabase
        .from("class_subjects")
        .select("class_id, subject_id")
        .eq("school_id", schoolId)
        .in("class_id", classIds)
        .eq("is_active", true),
      supabase
        .from("teacher_subjects")
        .select("class_id, subject_id, teacher_id")
        .eq("school_id", schoolId)
        .in("class_id", classIds)
        .eq("is_active", true)
        .not("teacher_id", "is", null),
    ]);

    const otherTeacherIds = [
      ...new Set(
        (explicitRows ?? [])
          .map((r) => r.teacher_id as string | null)
          .filter((id): id is string => typeof id === "string" && id !== teacherId),
      ),
    ];
    const activeTeacherIds = await activeTeacherIdsIn(supabase, schoolId, otherTeacherIds);

    const classSubjects = (classSubjectRows ?? [])
      .map((r) => ({ classId: r.class_id as string, subjectId: r.subject_id as string }))
      .filter((p) => Boolean(p.classId) && Boolean(p.subjectId));

    covered.push(
      ...classTeacherCoverage({
        classIds,
        classSubjects,
        ownedByOtherTeachers: blockingAssignments({
          rows: (explicitRows ?? []).map((r) => ({
            classId: (r.class_id as string | null) ?? null,
            subjectId: (r.subject_id as string | null) ?? null,
            teacherId: (r.teacher_id as string | null) ?? null,
          })),
          teacherId,
          activeTeacherIds,
        }),
      }),
    );
  }

  return { own, covered };
}

/**
 * The actor's question-authoring context, read from real assignments.
 *
 * A question is filed under one class + subject. A teacher's reach is their own
 * `teacher_subjects` rows, plus — as a class teacher — their class's subjects
 * (see `classTeacherCoverage` and `resolveTeachingPairs`). Rows missing either
 * id are skipped: they cannot scope a question to a context. An assignment
 * held by a deactivated or missing teacher is stale and never blocks coverage.
 */
export async function resolveQuestionContexts(
  supabase: SupabaseClient,
  actor: CbtActor,
): Promise<QuestionContexts> {
  if (actor.appRole === "school_admin" || actor.allClasses) return { kind: "all" };
  if (actor.appRole !== "teacher") return { kind: "pairs", pairs: [] };

  const teacherId = await getTeacherIdForProfile(supabase, actor.schoolId, actor.profileId);
  if (!teacherId) return { kind: "pairs", pairs: [] };

  const { own, covered } = await resolveTeachingPairs(supabase, actor.schoolId, teacherId);

  const pairs: TeachingPair[] = [];
  const seen = new Set<string>();
  for (const pair of [...own, ...covered]) {
    addPair(pairs, seen, pair.classId, pair.subjectId);
  }

  return { kind: "pairs", pairs };
}

export type CbtLookups = {
  getAssessment(assessmentId: string): Promise<AssessmentAlignment | null>;
  getTeacherIdForProfile(profileId: string): Promise<string | null>;
  listTeacherAssignments(teacherId: string): Promise<AssignmentRow[]>;
  /**
   * The subjects this teacher covers as class teacher, already net of
   * subjects held by another active teacher.
   */
  listTeacherCoverage(teacherId: string): Promise<TeachingPair[]>;
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

    async listTeacherCoverage(teacherId) {
      const { covered } = await resolveTeachingPairs(supabase, schoolId, teacherId);
      return covered;
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

export type QuestionContextAccess =
  | { ok: true; contexts: QuestionContexts }
  | { ok: false; status: number; reason: string };

/**
 * May this actor read or write questions filed under this class + subject?
 *
 * Enforced server-side on every bank route. The UI only offering authorized
 * classes is not a control — a crafted request can name any class id in the
 * school, so the decision has to be made here, from real assignments.
 */
export async function authorizeQuestionContext(
  supabase: SupabaseClient,
  actor: CbtActor,
  target: { classId: string | null; subjectId: string | null },
): Promise<QuestionContextAccess> {
  const contexts = await resolveQuestionContexts(supabase, actor);

  if (contexts.kind === "all") return { ok: true, contexts };

  if (!target.classId || !target.subjectId) {
    return {
      ok: false,
      status: 403,
      reason: "questions must be filed under a class and subject you teach",
    };
  }

  if (!questionContextAllows(contexts, target.classId, target.subjectId)) {
    return { ok: false, status: 403, reason: "that class and subject are not ones you teach" };
  }

  return { ok: true, contexts };
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

  if (evaluateTeacherAssignment(await lookups.listTeacherAssignments(teacherId), assessment)) {
    return true;
  }

  // Class-teacher coverage, on the same terms as the question bank: the class's
  // subjects minus subjects held by another ACTIVE teacher. The explicit rows
  // above keep their term tolerance; coverage is termless, like `class_teachers`.
  return coverageCoversAssessment(await lookups.listTeacherCoverage(teacherId), assessment);
}
