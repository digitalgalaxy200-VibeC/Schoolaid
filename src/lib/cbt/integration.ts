import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTemplateRows, readReportCardLock } from "@/lib/report-card";

/**
 * CBT → report card integration (Phase 19).
 *
 * THE BOUNDARY, stated once so it cannot drift:
 *
 *     CBT assessment → attempts → OFFICIAL result
 *         → this module
 *             → student_scores                    ← the ONLY table it writes
 *                 → existing approval / recalculation pipeline
 *                     → term_results / term_result_components
 *                         → report card
 *
 * CBT NEVER writes `term_results` or `term_result_components` (PD-1). Those
 * belong to the report-card pipeline, which already knows how to total, grade,
 * rank and publish. Writing them from here would bypass the approval workflow
 * and produce report cards no teacher ever approved.
 *
 * WHY THIS SOURCE FILE TAKES A PRIVILEGED CLIENT
 * ----------------------------------------------
 * This is a SYSTEM operation — promoting an official result — not a user action.
 * The user's authorization already happened in the route, through the CBT guard.
 * Two specific facts then force the service client:
 *
 *   1. `components_rows` / `components_templates` carry RLS but no tenant
 *      policies (they are school-owned through a template and have no
 *      `school_id` of their own), so a tenant-scoped token reads ZERO rows from
 *      them. Component resolution would fail for every caller rather than for
 *      the wrong one. `resolveTemplateRows` therefore uses the service client,
 *      and it is the canonical resolver the report-card path uses too.
 *   2. The report-card lock (`readReportCardLock`) is a route-level rule, not an
 *      RLS rule — `student_scores`' policies are school-wide and would permit
 *      the write. Relying on RLS here would silently drop the PD-3 lock.
 *
 * So the lock and the single-source rule are checked EXPLICITLY below. Anything
 * that reaches this module has already been authorized; what has not yet been
 * decided is whether writing is *allowed right now*, and that is its job.
 */

export type ComponentRow = {
  id: string;
  name: string;
  maximum_score: number | null;
  display_order: number | null;
};

export type OfficialResult = {
  studentId: string;
  attemptId: string;
  attemptNumber: number;
  totalScore: number;
};

export type PushConflict = { studentId: string; reason: string };

export type PushPlanEntry =
  | { kind: "write"; studentId: string; attemptId: string; score: number; replacing: boolean }
  | { kind: "conflict"; studentId: string; attemptId: string; reason: string };

export type PushPlan = {
  entries: PushPlanEntry[];
  /** True when something needs a human decision before the push can proceed. */
  hasConflicts: boolean;
};

/**
 * Decides what would be written, WITHOUT writing anything.
 *
 * Separating the plan from the write lets a caller show a teacher exactly what
 * is about to change — conflicts included — before anything does. An integration
 * that writes first and reports afterwards cannot be reviewed.
 */
export function planScorePush(args: {
  componentMaximum: number | null;
  results: OfficialResult[];
  existingScores: { student_id: string; score: number; managed_by_cbt: boolean }[];
  overwriteManual: boolean;
}): PushPlan {
  const { componentMaximum, results, existingScores, overwriteManual } = args;
  const existing = new Map(existingScores.map((s) => [s.student_id, s]));

  const entries: PushPlanEntry[] = [];

  for (const r of results) {
    if (componentMaximum !== null && r.totalScore > componentMaximum) {
      // Writing 35 into a 30-mark component silently corrupts a report card, and
      // the corruption only surfaces at publishing time.
      entries.push({
        kind: "conflict",
        studentId: r.studentId,
        attemptId: r.attemptId,
        reason: `the attempt scored ${r.totalScore}, more than the component's maximum of ${componentMaximum}`,
      });
      continue;
    }

    const current = existing.get(r.studentId);

    if (current && !current.managed_by_cbt && !overwriteManual) {
      // PD-2: a component has ONE source. A pre-existing manual score is either
      // stale configuration or a teacher's work — overwriting it silently is the
      // one outcome that must never happen by accident.
      entries.push({
        kind: "conflict",
        studentId: r.studentId,
        attemptId: r.attemptId,
        reason: `a manually entered score of ${current.score} already exists for this component`,
      });
      continue;
    }

    entries.push({
      kind: "write",
      studentId: r.studentId,
      attemptId: r.attemptId,
      score: r.totalScore,
      replacing: Boolean(current),
    });
  }

  return { entries, hasConflicts: entries.some((e) => e.kind === "conflict") };
}

/**
 * The component this assessment is allowed to feed.
 *
 * Uses `resolveTemplateRows` — the canonical class → level → school resolver — so
 * CBT and the report-card publishing path agree on what "this class's Test
 * component" means. A component that is not in the class's set is a
 * configuration error and is reported as one, never created on the fly.
 */
export async function resolveAssessmentComponent(args: {
  schoolId: string;
  classId: string;
  componentId: string | null;
}): Promise<{ ok: true; component: ComponentRow } | { ok: false; reason: string }> {
  if (!args.componentId) {
    return {
      ok: false,
      reason:
        "the assessment is not bound to a report-card component, so its score has nowhere to go",
    };
  }

  const rows = (await resolveTemplateRows(
    args.schoolId,
    args.classId,
    "class_components_templates",
    "components_templates",
    "components_rows",
  )) as unknown as ComponentRow[];

  const component = rows.find((r) => r.id === args.componentId);
  if (!component) {
    return {
      ok: false,
      reason: "the assessment's component is not one of this class's components",
    };
  }

  return { ok: true, component };
}

/**
 * The scores currently stored for this component, each tagged with whether CBT
 * owns it. Ownership is decided by PROVENANCE (`cbt_score_links`), never by
 * comparing values — a manual score that happens to equal the CBT score is still
 * a manual score.
 */
export async function loadExistingScores(
  supabase: SupabaseClient,
  args: { schoolId: string; termId: string; componentId: string; studentIds: string[] },
): Promise<{ student_id: string; score: number; managed_by_cbt: boolean }[]> {
  if (args.studentIds.length === 0) return [];

  const { data: scores } = await supabase
    .from("student_scores")
    .select("id, student_id, score")
    .eq("school_id", args.schoolId)
    .eq("term_id", args.termId)
    .eq("component_id", args.componentId)
    .in("student_id", args.studentIds);

  const rows = (scores ?? []) as { id: string; student_id: string; score: number }[];
  if (rows.length === 0) return [];

  const { data: links } = await supabase
    .from("cbt_score_links")
    .select("student_score_id")
    .eq("school_id", args.schoolId)
    .in(
      "student_score_id",
      rows.map((r) => r.id),
    );

  const managed = new Set((links ?? []).map((l) => l.student_score_id as string));

  return rows.map((r) => ({
    student_id: r.student_id,
    score: Number(r.score),
    managed_by_cbt: managed.has(r.id),
  }));
}

export type PushResult =
  | { ok: true; dryRun: boolean; written: number; conflicts: PushConflict[] }
  | { ok: false; error: string; locked: boolean; conflicts: PushConflict[] };

/**
 * Pushes official CBT scores into `student_scores`.
 *
 * `dryRun` performs every read and every decision but writes nothing, so a
 * caller can show the plan first. The PD-3 lock is read through the SAME helper
 * the manual score route uses, so the two paths cannot disagree about whether
 * writing is allowed.
 */
export async function pushOfficialResults(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    classId: string;
    termId: string;
    subjectId: string | null;
    componentId: string | null;
    results: OfficialResult[];
    overwriteManual?: boolean;
    dryRun?: boolean;
  },
): Promise<PushResult> {
  const { schoolId, classId, termId, subjectId, results } = args;

  if (results.length === 0) return { ok: true, dryRun: Boolean(args.dryRun), written: 0, conflicts: [] };

  // PD-3. `retracted` is editable; published, approved and pending_approval are not.
  const lock = await readReportCardLock(supabase, schoolId, classId, termId);
  if (lock.locked) {
    return {
      ok: false,
      locked: true,
      conflicts: [],
      error:
        `the report card for this class and term is '${lock.status}' and locked. ` +
        `A School Admin must retract it before CBT scores can be written.`,
    };
  }

  const resolved = await resolveAssessmentComponent({
    schoolId,
    classId,
    componentId: args.componentId,
  });
  if (!resolved.ok) return { ok: false, locked: false, conflicts: [], error: resolved.reason };

  const component = resolved.component;

  const existing = await loadExistingScores(supabase, {
    schoolId,
    termId,
    componentId: component.id,
    studentIds: results.map((r) => r.studentId),
  });

  const plan = planScorePush({
    componentMaximum: component.maximum_score,
    results,
    existingScores: existing,
    overwriteManual: args.overwriteManual ?? false,
  });

  const conflicts = plan.entries
    .filter((e): e is Extract<PushPlanEntry, { kind: "conflict" }> => e.kind === "conflict")
    .map((e) => ({ studentId: e.studentId, reason: e.reason }));

  if (args.dryRun) return { ok: true, dryRun: true, written: 0, conflicts };

  // Refuse the WHOLE batch on conflict rather than writing the clean rows and
  // reporting the rest. A half-applied push leaves a component with two sources
  // for some students, which is the state PD-2 exists to prevent.
  if (plan.hasConflicts) {
    return {
      ok: false,
      locked: false,
      conflicts,
      error: "some students have an existing score for this component",
    };
  }

  const writes = plan.entries.filter(
    (e): e is Extract<PushPlanEntry, { kind: "write" }> => e.kind === "write",
  );
  const byStudent = new Map(results.map((r) => [r.studentId, r]));

  let written = 0;

  for (const w of writes) {
    const result = byStudent.get(w.studentId);
    if (!result) continue;

    const { data: scoreRow, error } = await supabase
      .from("student_scores")
      .upsert(
        {
          school_id: schoolId,
          student_id: w.studentId,
          component_id: component.id,
          term_id: termId,
          subject_id: subjectId,
          // Written explicitly so the class alignment the report-card pipeline
          // enforces at publish time is recorded here too, at the point the
          // score is created.
          class_id: classId,
          score: w.score,
        },
        { onConflict: "student_id,component_id,term_id,subject_id" },
      )
      .select("id")
      .single();

    if (error || !scoreRow) {
      return {
        ok: false,
        locked: false,
        conflicts: [],
        error: `could not write the score for student ${w.studentId}: ${error?.message ?? "unknown error"}`,
      };
    }

    const { error: linkError } = await supabase.from("cbt_score_links").upsert(
      {
        school_id: schoolId,
        attempt_id: result.attemptId,
        student_score_id: scoreRow.id,
        component_id: component.id,
      },
      { onConflict: "attempt_id" },
    );

    if (linkError) {
      // The score exists but its provenance does not, so it would look like a
      // manual entry on the next push and be reported as a conflict forever.
      return {
        ok: false,
        locked: false,
        conflicts: [],
        error: `the score was written but its provenance could not be recorded: ${linkError.message}`,
      };
    }

    written += 1;
  }

  return { ok: true, dryRun: false, written, conflicts: [] };
}

/**
 * The official, marked result for each student on an assessment.
 *
 * Only `is_official` rows are returned. An attempt that exists but was never
 * made official is history, not a result, and must never reach a report card.
 *
 * Deliberately two plain queries rather than an embedded join: the join syntax
 * hides which table a filter applies to, and this is the function that decides
 * what lands on a child's report card.
 */
export async function loadOfficialResults(
  supabase: SupabaseClient,
  args: { schoolId: string; assessmentId: string },
): Promise<OfficialResult[]> {
  const { data: attempts } = await supabase
    .from("cbt_attempts")
    .select("id, student_id, attempt_number, status")
    .eq("school_id", args.schoolId)
    .eq("assessment_id", args.assessmentId)
    .eq("status", "marked");

  const attemptRows = (attempts ?? []) as {
    id: string;
    student_id: string;
    attempt_number: number;
    status: string;
  }[];
  if (attemptRows.length === 0) return [];

  const { data: results } = await supabase
    .from("cbt_results")
    .select("attempt_id, total_score, is_official")
    .eq("school_id", args.schoolId)
    .eq("is_official", true)
    .in(
      "attempt_id",
      attemptRows.map((a) => a.id),
    );

  const officialByAttempt = new Map(
    ((results ?? []) as { attempt_id: string; total_score: number }[]).map((r) => [
      r.attempt_id,
      Number(r.total_score),
    ]),
  );

  return attemptRows
    .filter((a) => officialByAttempt.has(a.id))
    .map((a) => ({
      studentId: a.student_id,
      attemptId: a.id,
      attemptNumber: a.attempt_number,
      totalScore: officialByAttempt.get(a.id) as number,
    }));
}
