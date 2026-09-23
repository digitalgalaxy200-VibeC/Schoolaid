import { NextResponse } from "next/server";
import { jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { getTeacherIdForProfile } from "@/lib/cbt/authz";
import { getActiveTerm, resolveTemplateRows } from "@/lib/report-card";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/cbt/assessments/options[?class_id=…] — what the assessment builder can
 * choose from.
 *
 * WHY THIS IS A SERVER ENDPOINT AND NOT THREE CLIENT FETCHES
 * ---------------------------------------------------------
 * `components_rows` is deliberately deny-all to tenants (it carries no `school_id`
 * of its own; it is owned through its template). A browser holding a tenant token
 * therefore CANNOT read the component list at all — it would get an empty array
 * and the builder would appear to have no components, for any school. Component
 * resolution has to happen server-side, through the same
 * `resolveTemplateRows` the report-card path uses.
 *
 * WHAT A TEACHER SEES
 * -------------------
 * Their own classes and subjects, not the whole school's. A teacher who is not
 * assigned to a class cannot build an assessment against it anyway — the guard
 * would refuse it — so offering it would only produce a form that fails on submit.
 * A school admin or an `all_classes` session sees everything in the school.
 *
 * The active term is returned because a score belongs to a term
 * (`student_scores.term_id` is NOT NULL) and the report-card lock is per
 * class + term.
 */

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { searchParams } = new URL(request.url);
  const errors = new ValidationErrors();
  const classId = uuid({ class_id: searchParams.get("class_id") }, "class_id", errors);
  if (!errors.ok) return jsonError(400, errors.summary());

  const term = await getActiveTerm(actor.schoolId);

  // Which classes may this actor build against?
  let allowedClassIds: Set<string> | null = null; // null = every class in the school

  if (actor.appRole === "teacher" && !actor.allClasses) {
    const teacherId = await getTeacherIdForProfile(scoped, actor.schoolId, actor.profileId);
    if (!teacherId) return jsonError(403, "no teacher record for this account");

    const [{ data: assignments }, { data: classTeacherRows }] = await Promise.all([
      scoped
        .from("teacher_subjects")
        .select("class_id, subject_id")
        .eq("school_id", actor.schoolId)
        .eq("teacher_id", teacherId)
        .eq("is_active", true),
      scoped
        .from("class_teachers")
        .select("class_id")
        .eq("school_id", actor.schoolId)
        .eq("teacher_id", teacherId)
        .eq("is_active", true),
    ]);

    allowedClassIds = new Set<string>();
    for (const a of assignments ?? []) if (a.class_id) allowedClassIds.add(a.class_id as string);
    for (const c of classTeacherRows ?? []) if (c.class_id) allowedClassIds.add(c.class_id as string);

    if (allowedClassIds.size === 0) {
      return NextResponse.json({ classes: [], term, components: [], subjects: [] });
    }
  }

  let classQuery = scoped
    .from("classes")
    .select("id, name")
    .eq("school_id", actor.schoolId)
    .order("name");
  if (allowedClassIds) classQuery = classQuery.in("id", [...allowedClassIds]);

  const { data: classRows, error: classError } = await classQuery;
  if (classError) return jsonError(500, classError.message);

  const classIds = (classRows ?? []).map((c) => c.id as string);

  // Subjects: the ones actually taught in the allowed classes, so the builder
  // cannot offer a subject the class does not run.
  const { data: subjectLinks } = classIds.length
    ? await scoped
        .from("class_subjects")
        .select("class_id, subject_id, subjects(name)")
        .eq("school_id", actor.schoolId)
        .in("class_id", classIds)
        .eq("is_active", true)
    : { data: [] };

  const subjectsByClass = new Map<string, { id: string; name: string }[]>();
  for (const link of subjectLinks ?? []) {
    const subject = Array.isArray(link.subjects) ? link.subjects[0] : link.subjects;
    if (!link.subject_id) continue;
    const list = subjectsByClass.get(link.class_id as string) ?? [];
    if (!list.some((s) => s.id === link.subject_id)) {
      list.push({
        id: link.subject_id as string,
        name: (subject?.name as string) ?? "Subject",
      });
    }
    subjectsByClass.set(link.class_id as string, list);
  }

  const classes = (classRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    subjects: subjectsByClass.get(c.id as string) ?? [],
  }));

  // Components only for a specific class — they are per class (or per level, or
  // per school) and mean nothing without one.
  let components: { id: string; name: string; maximum_score: number | null }[] = [];
  let subjects: { id: string; name: string }[] = [];

  if (classId) {
    if (allowedClassIds && !allowedClassIds.has(classId)) {
      return jsonError(403, "that class is not one you teach");
    }

    const rows = (await resolveTemplateRows(
      actor.schoolId,
      classId,
      "class_components_templates",
      "components_templates",
      "components_rows",
    )) as unknown as { id: string; name: string; maximum_score: number | null }[];

    components = rows.map((r) => ({
      id: r.id,
      name: r.name,
      maximum_score: r.maximum_score === null ? null : Number(r.maximum_score),
    }));

    subjects = subjectsByClass.get(classId) ?? [];
  }

  return NextResponse.json({
    classes,
    term,
    components,
    subjects,
  });
}
