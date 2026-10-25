/**
 * Aggregates the copilot can ask for — pure maths, no database.
 *
 * WHY THIS EXISTS AS A MODULE
 * ---------------------------
 * The model could only ask for ROWS. Counting a class of 120 students then meant
 * receiving names, truncated at 6,000 characters, and attempting arithmetic the
 * prompt explicitly forbids it from inventing. These functions turn a query into
 * a number, so the answer is exact and costs one small read instead of twelve
 * row reads across three model round-trips.
 *
 * Kept pure and tested separately: the arithmetic is where an off-by-one would
 * be invisible in production but wrong in every answer.
 */

export type ClassCount = {
  class_id: string | null;
  class: string;
  students: number;
};

export type ClassCounts = {
  /** Students in the rows the caller counted (after any status filter). */
  total: number;
  classes: ClassCount[];
  /** Students with no class — a real category, not a rounding error. */
  unassigned: number;
};

/**
 * Students per class, biggest first.
 *
 * Classes with no students ARE included — "which classes have nobody?" is a
 * question a school actually asks. Ties break on name so the answer is stable.
 */
export function summariseCountsByClass(
  classes: { id: string; name: string }[],
  students: { class_id: string | null }[],
): ClassCounts {
  const counts = new Map<string | null, number>();
  for (const student of students) {
    const key = student.class_id ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows: ClassCount[] = classes
    .map((klass) => ({
      class_id: klass.id,
      class: klass.name,
      students: counts.get(klass.id) ?? 0,
    }))
    .sort((a, b) => b.students - a.students || a.class.localeCompare(b.class));

  return {
    total: students.length,
    classes: rows,
    unassigned: counts.get(null) ?? 0,
  };
}

export type TermSummary = {
  classes: {
    total: number;
    with_submission: number;
    awaiting_review: number;
    approved: number;
    published: number;
    returned: number;
    retracted: number;
    not_started: number;
  };
  /** term_results rows for the term — 0 means there is nothing to publish yet. */
  result_rows: number;
  /** Classes frozen with results and waiting only for the publish click. */
  ready_to_publish: number;
};

/**
 * The publishing state of one term, at class granularity.
 *
 * One submission row per class per term is the unit of truth here, because that
 * is what the Report Cards screen acts on. A row may move
 * draft → pending_approval → approved → published, and can be returned or
 * retracted; the last status for a class wins.
 */
export function summariseTerm(
  totalClasses: number,
  submissions: { class_id: string; status: string }[],
  resultRows: number,
): TermSummary {
  const byClass = new Map<string, string>();
  for (const submission of submissions) {
    if (submission.class_id) byClass.set(submission.class_id, submission.status);
  }

  const statuses = [...byClass.values()];
  const countOf = (status: string) => statuses.filter((s) => s === status).length;
  const withSubmission = byClass.size;

  return {
    classes: {
      total: totalClasses,
      with_submission: withSubmission,
      awaiting_review: countOf("pending_approval"),
      approved: countOf("approved"),
      published: countOf("published"),
      returned: countOf("returned"),
      retracted: countOf("retracted"),
      not_started: Math.max(0, totalClasses - withSubmission),
    },
    result_rows: resultRows,
    ready_to_publish: countOf("approved"),
  };
}
