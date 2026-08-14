export type Student = { id: string; admission_no: string; name: string; photo_url: string | null; gender?: string | null };
export type Subject = { id: string; name: string };
export type GradingRow = { grade: string; minimum_score: number; maximum_score: number; remark: string | null; principal_remark?: string | null };
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
    offeredCount: done.length,
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

// ── Behaviour-Based Teacher Remark Templates ──────────────────

interface TraitInfo {
  name: string;
  score: number; // 1–5 numeric
}

const EXCELLENT_REMARKS = [
  "Excellent behaviour. Keep up the outstanding attitude.",
  "A well-behaved and responsible pupil. Keep up the excellent work.",
  "An exemplary student with a positive attitude towards learning.",
  "Keep maintaining your excellent conduct and commitment to learning.",
];

const VERY_GOOD_REMARKS = [
  "Very good behaviour. Keep striving for excellence.",
  "A responsible and hardworking pupil. Continue the good work.",
  "Shows a positive attitude towards learning. Keep it up.",
  "Good behaviour and participation. Continue to improve.",
];

const GOOD_REMARKS = [
  "Good progress this term. Stay focused and aim higher.",
  "A cooperative pupil with good potential. Keep working hard.",
  "Continue to build confidence and participate more actively.",
  "You are doing well. More consistency will bring even better results.",
];

const NEEDS_IMPROVEMENT_REMARKS = [
  "More effort and concentration are needed next term.",
  "Be more attentive in class and participate actively.",
  "You have great potential. Stay focused and work harder.",
  "Improve your study habits and classroom participation.",
];

const BEHAVIOURAL_GUIDANCE = [
  "Be more punctual and attentive during lessons.",
  "Continue showing respect and responsibility.",
  "Reduce distractions and remain focused in class.",
  "Keep improving your discipline and classroom participation.",
  "Maintain your positive attitude towards learning.",
];

/**
 * Generate a short, natural teacher remark.
 * Exactly 1-2 sentences, max ~25 words each.
 * Uses the student's psychomotor and affective ratings as context only.
 * Never lists individual traits.
 */
export function suggestRemark(
  studentName: string,
  _gender: string | null | undefined,
  psychomotor: TraitInfo[],
  affective: TraitInfo[],
  attendancePct: number | null,
): string {
  // Compute overall behaviour score from all trait ratings
  const allTraits = [...psychomotor, ...affective];
  let traitAvg = 3; // default to middle if no traits
  if (allTraits.length > 0) {
    traitAvg = allTraits.reduce((s, t) => s + t.score, 0) / allTraits.length;
  }

  // Blend attendance into the score
  let score = traitAvg;
  if (attendancePct !== null && attendancePct >= 95) score = Math.min(5, traitAvg + 0.3);
  if (attendancePct !== null && attendancePct < 70) score = Math.max(1, traitAvg - 0.5);

  // Pick a remark from the right band, using student name for variety
  const hash = [...studentName].reduce((h, c) => h + c.charCodeAt(0), 0);
  let pool: string[];

  if (score >= 4.5) {
    pool = EXCELLENT_REMARKS;
  } else if (score >= 3.5) {
    pool = VERY_GOOD_REMARKS;
  } else if (score >= 2.5) {
    pool = GOOD_REMARKS;
  } else if (score >= 1.5) {
    pool = NEEDS_IMPROVEMENT_REMARKS;
  } else {
    pool = BEHAVIOURAL_GUIDANCE;
  }

  return pool[hash % pool.length];
}

// ── Principal Remark Generation (Academic) ─────────────────────

/**
 * Generate a principal's remark based on academic performance.
 * Uses the school's configured grading templates. The remark is always
 * derived from the matched grading band, never from hardcoded thresholds.
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

  // Match the school's configured grading band by percentage
  const matchedGrade = gradingRows.find(
    (g) => average >= Number(g.minimum_score) && average <= Number(g.maximum_score)
  );

  // Priority 1: Use the configured principal_remark template (school-specific)
  if (matchedGrade?.principal_remark) {
    return matchedGrade.principal_remark
      .replace(/{name}/gi, firstName)
      .replace(/{average}/gi, average.toFixed(1))
      .replace(/{grade}/gi, matchedGrade.grade)
      .replace(/{He\/She}/g, heShe)
      .replace(/{he\/she}/g, heShe.toLowerCase())
      .replace(/{his\/her}/gi, hisHer)
      .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
      .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
  }

  // Priority 2: Derive from the matched grade's configured remark descriptor
  // (e.g. "Fair", "Good", "Very Good"), NOT hardcoded percentage thresholds.
  const descriptor = (matchedGrade?.remark || "satisfactory").toLowerCase();
  return `${firstName} had ${descriptor === "excellent" || descriptor === "very good" || descriptor === "outstanding" ? "a" : "a"} ${descriptor} result.`;
}
