export type Student = { id: string; admission_no: string; name: string; photo_url: string | null; gender?: string | null };
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

// ── Behaviour-Based Teacher Remark Generation ──────────────────

interface TraitInfo {
  name: string;
  score: number; // 1–5 numeric
}

// Remark templates by behaviour band — short, natural, 1-2 sentences
const EXCELLENT_REMARKS = [
  "Excellent behaviour. Keep up the outstanding attitude.",
  "A well-behaved and responsible pupil. Keep up the excellent work.",
  "An exemplary student with a positive attitude towards learning.",
  "Keep maintaining your excellent conduct and commitment to learning.",
  "{name} is a model pupil who consistently demonstrates excellent conduct.",
  "Outstanding behaviour and participation throughout the term.",
];

const VERY_GOOD_REMARKS = [
  "Very good behaviour. Keep striving for excellence.",
  "A responsible and hardworking pupil. Continue the good work.",
  "Shows a positive attitude towards learning. Keep it up.",
  "Good behaviour and participation. Continue to improve.",
  "{name} is well-behaved and participates actively in class.",
  "A cooperative and hardworking pupil with a bright attitude.",
];

const GOOD_REMARKS = [
  "Good progress this term. Stay focused and aim higher.",
  "A cooperative pupil with good potential. Keep working hard.",
  "Continue to build confidence and participate more actively.",
  "You are doing well. More consistency will bring even better results.",
  "{name} has shown steady improvement. Keep up the good effort.",
  "Satisfactory conduct and participation. Continue to develop.",
];

const NEEDS_IMPROVEMENT_REMARKS = [
  "More effort and concentration are needed next term.",
  "Be more attentive in class and participate actively.",
  "You have great potential. Stay focused and work harder.",
  "Improve your study habits and classroom participation.",
  "{name} is encouraged to stay focused and take learning seriously.",
  "A greater commitment to studies is required next term.",
];

// Contextual extras that can be appended based on specific signals
const ATTENDANCE_GOOD = [
  " Excellent attendance this term.",
  " Well done for consistent attendance.",
];

const ATTENDANCE_POOR = [
  " Attendance needs to improve.",
  " Please work on improving punctuality.",
];

const DISTRACTION_HINT = [
  " Reduce distractions and remain focused in class.",
  " Stay focused and avoid unnecessary distractions.",
];

/**
 * Generate a short, natural teacher remark from behaviour data.
 * Max 2 sentences, max ~25 words each. Never lists traits.
 */
export function suggestRemark(
  studentName: string,
  gender: string | null | undefined,
  psychomotor: TraitInfo[],
  affective: TraitInfo[],
  attendancePct: number | null,
): string {
  const firstName = studentName.split(" ")[0];

  // Compute overall behaviour score
  const allTraits = [...psychomotor, ...affective];
  const traitAvg = allTraits.length > 0
    ? allTraits.reduce((s, t) => s + t.score, 0) / allTraits.length
    : 3;

  // Blend attendance into score (small weight)
  let behaviourScore = traitAvg;
  if (attendancePct !== null) {
    if (attendancePct >= 95) behaviourScore = Math.min(5, traitAvg + 0.3);
    else if (attendancePct < 70) behaviourScore = Math.max(1, traitAvg - 0.5);
  }

  // Pick a deterministic remark based on student name hash
  const hash = [...firstName].reduce((h, c) => h + c.charCodeAt(0), 0);

  let pool: string[];
  if (behaviourScore >= 4.5) pool = EXCELLENT_REMARKS;
  else if (behaviourScore >= 3.5) pool = VERY_GOOD_REMARKS;
  else if (behaviourScore >= 2.5) pool = GOOD_REMARKS;
  else pool = NEEDS_IMPROVEMENT_REMARKS;

  let remark = pool[hash % pool.length];
  remark = remark.replace(/{name}/g, firstName);

  // Optionally append attendance note or guidance — but keep it to 2 sentences max
  const sentences = remark.split(/(?<=[.!])\s+/);

  if (sentences.length < 2 && attendancePct !== null && attendancePct < 70) {
    const attRemark = ATTENDANCE_POOR[hash % ATTENDANCE_POOR.length];
    remark += attRemark;
  }

  // If behaviour is poor, add a sharp one-liner instead of the attendance note
  if (sentences.length < 2 && behaviourScore < 2.5 && attendancePct !== null && attendancePct < 70) {
    // Already handled above
  }

  return remark;
}

// ── Principal Remark Generation (Academic) ─────────────────────

/**
 * Generate a principal's remark based on academic performance.
 * Uses grading templates with variable substitution.
 */
export function generatePrincipalRemark(
  studentName: string,
  average: number,
  grade: string,
  gender: string | null | undefined,
  gradingRows: GradingRow[],
): string {
  const firstName = studentName.split(" ")[0];
  const isFemale = gender?.toLowerCase() === "female" || gender?.toLowerCase() === "f";
  const isMale = gender?.toLowerCase() === "male" || gender?.toLowerCase() === "m";
  const heShe = isFemale ? "She" : isMale ? "He" : "They";
  const hisHer = isFemale ? "her" : isMale ? "his" : "their";

  // Priority 1: Use configured principal_remark template
  const matchedGrade = gradingRows.find(
    (g) => average >= Number(g.minimum_score) && average <= Number(g.maximum_score)
  );

  if ((matchedGrade as any)?.principal_remark) {
    return (matchedGrade as any).principal_remark
      .replace(/{name}/gi, firstName)
      .replace(/{average}/gi, average.toFixed(1))
      .replace(/{grade}/gi, matchedGrade?.grade || "")
      .replace(/{He\/She}/g, heShe)
      .replace(/{he\/she}/g, heShe.toLowerCase())
      .replace(/{his\/her}/gi, hisHer)
      .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
      .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
  }

  // Priority 2: Formula-based remark
  let performance: string;
  if (average >= 80) performance = "an excellent result";
  else if (average >= 70) performance = "a very good result";
  else if (average >= 60) performance = "a good result";
  else if (average >= 50) performance = "an average result";
  else performance = "a poor result. " + heShe + " can do better";

  return `${firstName} had ${performance}.`;
}
