/**
 * What the Home screen is allowed to claim.
 *
 * Every number below is derived from a real table — there is no snapshot table
 * and no "last updated" flag to drift. The readiness arithmetic is pure and
 * lives here so it can be tested without a database.
 */

import type { TermProgress } from "./term";

export type ScoreRow = {
  student_id: string;
  subject_id: string | null;
  assessment_component_id: string | null;
};

export type ReadinessInput = {
  classId: string;
  className: string;
  /** Active students currently in this class. */
  studentIds: string[];
  /** Subjects actively assigned to this class. */
  subjectIds: string[];
  /** Assessment components resolved for this class (class → level → school). */
  componentIds: string[];
};

export type ReadinessRow = {
  classId: string;
  className: string;
  studentCount: number;
  subjectCount: number;
  componentCount: number;
  /** students × subjects × components. 0 means the class is not configured. */
  expected: number;
  entered: number;
  /** 0–100, or null when there is nothing to measure yet. */
  percent: number | null;
};

/**
 * Marks entered as a share of the marks this class is expected to hold.
 *
 * A row counts once per student/subject/component (the unique key since
 * migration 016) and only when its subject and component actually belong to the
 * class — a stray row from another class's setup cannot inflate the percentage.
 * A class with no students, subjects or components returns `percent: null`:
 * "not measured" is honest, "0%" would blame the teacher for an unconfigured
 * class.
 */
export function computeReadiness(
  classes: ReadinessInput[],
  scores: ScoreRow[],
): ReadinessRow[] {
  type ClassLookup = {
    classId: string;
    subjects: Set<string>;
    components: Set<string>;
  };

  const byStudent = new Map<string, ClassLookup>();
  for (const cls of classes) {
    const lookup: ClassLookup = {
      classId: cls.classId,
      subjects: new Set(cls.subjectIds),
      components: new Set(cls.componentIds),
    };
    for (const studentId of cls.studentIds) byStudent.set(studentId, lookup);
  }

  const enteredByClass = new Map<string, Set<string>>();
  for (const score of scores) {
    if (!score.subject_id || !score.assessment_component_id) continue;
    const lookup = byStudent.get(score.student_id);
    if (!lookup) continue;
    if (!lookup.subjects.has(score.subject_id)) continue;
    if (!lookup.components.has(score.assessment_component_id)) continue;

    let entered = enteredByClass.get(lookup.classId);
    if (!entered) {
      entered = new Set<string>();
      enteredByClass.set(lookup.classId, entered);
    }
    entered.add(`${score.student_id}:${score.subject_id}:${score.assessment_component_id}`);
  }

  return classes
    .map((cls): ReadinessRow => {
      const studentCount = cls.studentIds.length;
      const subjectCount = cls.subjectIds.length;
      const componentCount = cls.componentIds.length;
      const expected = studentCount * subjectCount * componentCount;
      const entered = enteredByClass.get(cls.classId)?.size ?? 0;
      const percent =
        expected > 0
          ? Math.min(100, Math.round((entered / expected) * 100))
          : null;

      return {
        classId: cls.classId,
        className: cls.className,
        studentCount,
        subjectCount,
        componentCount,
        expected,
        entered,
        percent,
      };
    })
    .sort((a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: "base" }),
    );
}

export type DashboardTerm = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sessionName: string;
  progress: TermProgress | null;
};

export type PendingReportCard = {
  classId: string;
  className: string;
  submittedAt: string | null;
  submittedBy: string | null;
};

export type SetupChecklist = {
  percent: number;
  state: string;
  requiredComplete: number;
  requiredTotal: number;
  next: {
    id: string;
    label: string;
    detail: string;
    href: string;
    action: string;
  }[];
};

export type TodayAttendance = {
  date: string;
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** present + late over marked, 0–100, or null when nothing is marked. */
  rate: number | null;
  unmarkedClasses: { classId: string; className: string; studentCount: number }[];
};

export type DashboardSummary = {
  school: {
    name: string;
    motto: string | null;
    slug: string | null;
  };
  impersonated: boolean;
  term: DashboardTerm | null;
  counts: {
    classes: number;
    teachers: number;
    students: number;
  };
  needsAttention: {
    pendingReportCards: PendingReportCard[];
    studentsWithoutClass: number;
  };
  readiness: ReadinessRow[];
  attendance: TodayAttendance;
  setup: SetupChecklist | null;
  generatedAt: string;
};

/** The finance figures Home shows, as returned by the finance dashboard API. */
export type FinanceSummary = {
  totalCharged: string;
  totalCollected: string;
  outstanding: string;
  collectionRate: number;
  expected: number;
  collected: number;
  outstandingAmount: number;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
};
