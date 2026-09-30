import { NextResponse } from "next/server";
import { jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { resolveQuestionContexts } from "@/lib/cbt/authz";

/**
 * GET /api/cbt/questions/context — where may this actor author questions?
 *
 * Returns the class+subject pairs a teacher is actually assigned to, or every
 * class in the school for a school admin / `all_classes` session. The question
 * bank, the question form and the AI import all read their class/subject
 * dropdowns from here, so none of them can offer a context the server would
 * then refuse.
 *
 * This endpoint only DECIDES what to show. Enforcement does not depend on it:
 * every question route re-derives the same context server-side and refuses a
 * request outside it.
 */

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const contexts = await resolveQuestionContexts(scoped, gate.actor);

  if (contexts.kind === "all") {
    const { data: classRows, error } = await scoped
      .from("classes")
      .select("id, name")
      .eq("school_id", gate.actor.schoolId)
      .order("name");
    if (error) return jsonError(500, error.message);

    const classIds = (classRows ?? []).map((c) => c.id as string);

    const { data: subjectLinks } = classIds.length
      ? await scoped
          .from("class_subjects")
          .select("class_id, subject_id, subjects(name)")
          .eq("school_id", gate.actor.schoolId)
          .in("class_id", classIds)
          .eq("is_active", true)
      : { data: [] };

    const subjectsByClass = new Map<string, { id: string; name: string }[]>();
    for (const link of subjectLinks ?? []) {
      const subject = Array.isArray(link.subjects) ? link.subjects[0] : link.subjects;
      if (!link.subject_id) continue;
      const list = subjectsByClass.get(link.class_id as string) ?? [];
      if (!list.some((s) => s.id === link.subject_id)) {
        list.push({ id: link.subject_id as string, name: (subject?.name as string) ?? "Subject" });
      }
      subjectsByClass.set(link.class_id as string, list);
    }

    return NextResponse.json({
      all: true,
      classes: (classRows ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        subjects: subjectsByClass.get(c.id as string) ?? [],
      })),
    });
  }

  // A teacher sees exactly the pairs the school assigned, and nothing else.
  if (contexts.pairs.length === 0) {
    return NextResponse.json({ all: false, classes: [] });
  }

  const classIds = [...new Set(contexts.pairs.map((p) => p.classId))];
  const subjectIds = [...new Set(contexts.pairs.map((p) => p.subjectId))];

  const [{ data: classRows }, { data: subjectRows }] = await Promise.all([
    scoped
      .from("classes")
      .select("id, name")
      .eq("school_id", gate.actor.schoolId)
      .in("id", classIds),
    scoped
      .from("subjects")
      .select("id, name")
      .eq("school_id", gate.actor.schoolId)
      .in("id", subjectIds),
  ]);

  const classById = new Map((classRows ?? []).map((c) => [c.id as string, c.name as string]));
  const subjectById = new Map((subjectRows ?? []).map((s) => [s.id as string, s.name as string]));

  const byClass = new Map<string, { id: string; name: string }[]>();
  for (const pair of contexts.pairs) {
    if (!classById.has(pair.classId) || !subjectById.has(pair.subjectId)) continue;
    const list = byClass.get(pair.classId) ?? [];
    if (!list.some((s) => s.id === pair.subjectId)) {
      list.push({ id: pair.subjectId, name: subjectById.get(pair.subjectId) ?? "Subject" });
    }
    byClass.set(pair.classId, list);
  }

  const classes = [...byClass.entries()]
    .map(([id, subjects]) => ({ id, name: classById.get(id) ?? "Class", subjects }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ all: false, classes });
}
