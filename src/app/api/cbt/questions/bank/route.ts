import { NextResponse } from "next/server";
import { jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { resolveQuestionContexts } from "@/lib/cbt/authz";

/**
 * GET /api/cbt/questions/bank — the academic tree the Question Bank browses by.
 *
 * Session → Term → Class → Subject, with a question count on each subject. Only
 * paths that actually contain questions are returned, so an empty year does not
 * render as a dead branch; the flat lists alongside it drive the filter selects.
 *
 * A teacher sees only the class+subject pairs they may author in. That is the
 * same rule the bank list applies, enforced server-side rather than by hiding
 * options in the browser.
 *
 * `unfiled` counts PUBLISHED questions with no term at all (legacy rows). They
 * are not lost — the bank list still finds them — they simply have no branch yet.
 */

type Row = {
  session_id: string | null;
  term_id: string | null;
  class_id: string | null;
  subject_id: string | null;
};
type Named = { id: string; name: string };

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;
  const schoolId = gate.actor.schoolId;

  const contexts = await resolveQuestionContexts(scoped, gate.actor);
  const allowedPairs =
    contexts.kind === "pairs"
      ? new Set(contexts.pairs.map((p) => `${p.classId}|${p.subjectId}`))
      : null;

  const [sessions, terms, classes, subjects, rows] = await Promise.all([
    scoped.from("academic_sessions").select("id, name").eq("school_id", schoolId).order("name"),
    scoped
      .from("academic_terms")
      .select("id, name, session_id")
      .eq("school_id", schoolId)
      .order("name"),
    scoped.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
    scoped.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
    scoped
      .from("cbt_questions")
      .select("session_id, term_id, class_id, subject_id")
      .eq("school_id", schoolId)
      // The tree is the HISTORICAL bank: only questions that have appeared on a
      // published paper. Everything still in preparation lives in the other view.
      .not("published_at", "is", null),
  ]);

  for (const res of [sessions, terms, classes, subjects]) {
    if (res.error) return jsonError(500, res.error.message);
  }
  if (rows.error) return jsonError(500, rows.error.message);

  const sessionName = new Map<string, string>(
    ((sessions.data ?? []) as Named[]).map((s) => [s.id, s.name]),
  );
  const className = new Map<string, string>(
    ((classes.data ?? []) as Named[]).map((c) => [c.id, c.name]),
  );
  const subjectName = new Map<string, string>(
    ((subjects.data ?? []) as Named[]).map((s) => [s.id, s.name]),
  );
  const termRows = (terms.data ?? []) as (Named & { session_id: string | null })[];

  // session → term → class → subject → count
  const tree = new Map<string, Map<string, Map<string, Map<string, number>>>>();
  let unfiled = 0;

  for (const row of (rows.data ?? []) as Row[]) {
    if (!row.class_id || !row.subject_id) continue;
    if (allowedPairs && !allowedPairs.has(`${row.class_id}|${row.subject_id}`)) continue;
    if (!row.term_id || !row.session_id) {
      unfiled += 1;
      continue;
    }

    const byTerm = tree.get(row.session_id) ?? new Map();
    tree.set(row.session_id, byTerm);
    const byClass = byTerm.get(row.term_id) ?? new Map();
    byTerm.set(row.term_id, byClass);
    const bySubject = byClass.get(row.class_id) ?? new Map();
    byClass.set(row.class_id, bySubject);
    bySubject.set(row.subject_id, (bySubject.get(row.subject_id) ?? 0) + 1);
  }

  const sumSubjects = (bySubject: Map<string, number>) =>
    [...bySubject.values()].reduce((sum, n) => sum + n, 0);
  const sumClasses = (byClass: Map<string, Map<string, number>>) =>
    [...byClass.values()].reduce((sum, bySubject) => sum + sumSubjects(bySubject), 0);

  const branches = [...tree.entries()]
    .map(([sessionId, byTerm]) => ({
      id: sessionId,
      name: sessionName.get(sessionId) ?? "—",
      terms: [...byTerm.entries()]
        .map(([termId, byClass]) => ({
          id: termId,
          name: termRows.find((t) => t.id === termId)?.name ?? "—",
          classes: [...byClass.entries()]
            .map(([classId, bySubject]) => ({
              id: classId,
              name: className.get(classId) ?? "—",
              questions: sumSubjects(bySubject),
              subjects: [...bySubject.entries()]
                .map(([subjectId, count]) => ({
                  id: subjectId,
                  name: subjectName.get(subjectId) ?? "—",
                  questions: count,
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          questions: sumClasses(byClass),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      questions: [...byTerm.values()].reduce((sum, byClass) => sum + sumClasses(byClass), 0),
    }))
    .sort((a, b) => b.name.localeCompare(a.name));

  return NextResponse.json({
    tree: branches,
    unfiled,
    // Flat lists for the filter selects.
    sessions: (sessions.data ?? []) as Named[],
    terms: termRows.map((t) => ({ id: t.id, name: t.name, session_id: t.session_id })),
    classes: ((classes.data ?? []) as Named[]).filter(
      (c) => !allowedPairs || [...allowedPairs].some((p) => p.startsWith(`${c.id}|`)),
    ),
    subjects: (subjects.data ?? []) as Named[],
  });
}
