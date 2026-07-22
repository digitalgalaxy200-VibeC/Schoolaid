export type Student = { id: string; admission_no: string; name: string; photo_url: string | null };
export type Subject = { id: string; name: string };
export type GradingRow = { grade: string; minimum_score: number; maximum_score: number; remark: string | null };
export type Trait = { id: string; name: string };
export type ScoreRow = { student_id: string; subject_id: string | null; component_id: string; score: number };
export type AttendanceDraft = { days_school_opened: string; days_present: string };

export const TRAIT_RATINGS = [
  { value: "5", label: "5 — Excellent" },
  { value: "4", label: "4 — Very Good" },
  { value: "3", label: "3 — Good" },
  { value: "2", label: "2 — Fair" },
  { value: "1", label: "1 — Poor" },
];

export function gradeFor(pct: number, rows: GradingRow[]): string {
  const r = rows.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score));
  return r?.grade || "N/A";
}

export function gradeRemarkFor(pct: number, rows: GradingRow[]): string {
  const r = rows.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score));
  return r?.remark || "";
}

/** Per-student, per-subject total; null when no score rows exist for that subject. */
export function subjectTotal(scores: ScoreRow[], studentId: string, subjectId: string): number | null {
  const rows = scores.filter((s) => s.student_id === studentId && s.subject_id === subjectId);
  if (rows.length === 0) return null;
  return rows.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
}

/** Summary over subjects that HAVE scores (percentage of component max). */
export function studentSummary(
  scores: ScoreRow[],
  subjects: Subject[],
  studentId: string,
  maxTotal: number,
  grading: GradingRow[],
) {
  const totals = subjects.map((subj) => ({ subject: subj, total: subjectTotal(scores, studentId, subj.id) }));
  const done = totals.filter((t) => t.total !== null) as { subject: Subject; total: number }[];
  const grand = done.reduce((s, t) => s + t.total, 0);
  const avg = done.length > 0 && maxTotal > 0 ? (grand / done.length / maxTotal) * 100 : 0;
  return {
    totals,
    grand,
    average: avg,
    grade: gradeFor(avg, grading),
    pending: totals.filter((t) => t.total === null).map((t) => t.subject.name),
  };
}

/** Positions: rank students by average desc; equal averages share position. */
export function computePositions(averages: Map<string, number>): Map<string, number> {
  const sorted = [...averages.entries()].sort((a, b) => b[1] - a[1]);
  const pos = new Map<string, number>();
  sorted.forEach(([sid, avg], i) => {
    if (i > 0 && avg === sorted[i - 1][1]) pos.set(sid, pos.get(sorted[i - 1][0])!);
    else pos.set(sid, i + 1);
  });
  return pos;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Suggested teacher remark from average/grade/attendance %. */
export function suggestRemark(average: number, grade: string, attendancePct: number | null) {
  let base: string;
  if (average >= 80) base = "An excellent result. Keep up the outstanding work.";
  else if (average >= 70) base = "A very good performance. Keep aiming higher.";
  else if (average >= 60) base = "A good result with room for improvement.";
  else if (average >= 50) base = "A fair performance. More effort is needed.";
  else base = "Needs significant improvement. Please encourage consistent study.";
  let att = "";
  if (attendancePct !== null) {
    if (attendancePct >= 95) att = " Excellent attendance.";
    else if (attendancePct < 75) att = " Attendance needs improvement.";
  }
  return `${base}${att}`;
}
