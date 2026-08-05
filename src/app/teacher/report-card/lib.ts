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

/**
 * Generate a personalised teacher remark based on behaviour,
 * psychomotor skills, affective traits, and attendance.
 * Never uses academic averages or grades.
 */
export function suggestRemark(
  studentName: string,
  gender: string | null | undefined,
  psychomotor: TraitInfo[],
  affective: TraitInfo[],
  attendancePct: number | null,
): string {
  const firstName = studentName.split(" ")[0];
  const isFemale = gender?.toLowerCase() === "female" || gender?.toLowerCase() === "f";
  const pronoun = isFemale ? "She" : "He";
  const possessive = isFemale ? "her" : "his";
  const object = isFemale ? "her" : "him";

  // Compute average scores per domain
  const psychoAvg = psychomotor.length > 0
    ? psychomotor.reduce((s, t) => s + t.score, 0) / psychomotor.length
    : 0;
  const affectAvg = affective.length > 0
    ? affective.reduce((s, t) => s + t.score, 0) / affective.length
    : 0;

  // Find strongest and weakest traits
  const allTraits = [...psychomotor, ...affective];
  const sorted = [...allTraits].sort((a, b) => b.score - a.score);
  const strengths = sorted.filter(t => t.score >= 4).map(t => t.name.toLowerCase());
  const weaknesses = sorted.filter(t => t.score <= 2).map(t => t.name.toLowerCase());

  // Build the remark
  const parts: string[] = [];

  // Opening — character description based on affective traits
  if (affectAvg >= 4.5) {
    parts.push(`${firstName} is an exceptionally well-behaved and respectful pupil.`);
  } else if (affectAvg >= 3.5) {
    const opener = isFemale
      ? `${firstName} is a cheerful and well-mannered pupil`
      : `${firstName} is a pleasant and well-behaved pupil`;
    parts.push(`${opener} who relates well with ${possessive} classmates and teachers.`);
  } else if (affectAvg >= 2.5) {
    parts.push(`${firstName} is a friendly pupil who is working on improving ${possessive} conduct in class.`);
  } else {
    parts.push(`${firstName} needs to work on ${possessive} behaviour and attitude towards school work.`);
  }

  // Strengths
  if (strengths.length >= 2) {
    const last = strengths.pop();
    parts.push(`${pronoun} demonstrates strong ${strengths.join(", ")} and ${last}.`);
  } else if (strengths.length === 1) {
    parts.push(`${pronoun} shows good ${strengths[0]}.`);
  }

  // Participation / Psychomotor
  if (psychoAvg >= 4) {
    parts.push(`${pronoun} actively participates in classroom and school activities.`);
  } else if (psychoAvg >= 3) {
    parts.push(`${pronoun} participates in most class activities and shows interest in learning.`);
  } else {
    parts.push(`${pronoun} is encouraged to participate more actively in class activities.`);
  }

  // Attendance
  if (attendancePct !== null) {
    if (attendancePct >= 95) {
      parts.push(`${pronoun} has excellent attendance and is consistently punctual.`);
    } else if (attendancePct >= 85) {
      parts.push(`${pronoun} maintains good attendance.`);
    } else if (attendancePct >= 70) {
      parts.push(`${pronoun}'s attendance is fair but could be improved.`);
    } else if (attendancePct < 70) {
      parts.push(`${pronoun} needs to improve ${possessive} attendance and punctuality.`);
    }
  }

  // Weaknesses — constructive
  if (weaknesses.length === 1) {
    parts.push(`With more focus on ${weaknesses[0]}, ${firstName} can achieve even better results.`);
  } else if (weaknesses.length >= 2) {
    parts.push(`Improving in ${weaknesses.slice(0, 2).join(" and ")} will help ${object} develop further.`);
  }

  // Closing — encouraging
  if (psychoAvg >= 4 && affectAvg >= 4) {
    parts.push(`I encourage ${object} to maintain this excellent attitude.`);
  } else if (psychoAvg >= 3 || affectAvg >= 3) {
    parts.push(`Keep up the effort, ${firstName}!`);
  } else {
    parts.push(`I believe ${pronoun.toLowerCase()} can do better with more commitment and focus.`);
  }

  return parts.join(" ");
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
