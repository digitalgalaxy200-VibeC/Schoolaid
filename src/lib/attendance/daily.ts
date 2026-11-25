/**
 * Daily attendance — pure rules.
 *
 * The platform has TWO attendance records and they are not interchangeable:
 *
 *   `attendance`          one row per student, per class, per day. This is the
 *                         daily register, and it is the only source that can
 *                         answer "who is absent today?".
 *   `attendance_records`  one row per student, per TERM: days opened, days
 *                         present, days absent. This is what report cards print.
 *
 * The daily register rolls up into the term row after every save, so a teacher
 * who marks a register does not have to retype totals at report-card time.
 */

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** Date-only strings compare correctly as strings; future registers are a typo. */
export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}

export type DailySummary = {
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** present + late. An excused absence is still an absence for the rate. */
  attended: number;
  /** 0–100, or null when nothing has been marked. */
  rate: number | null;
};

export function summarizeDaily(
  records: { status: AttendanceStatus }[],
): DailySummary {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const record of records) counts[record.status] += 1;

  const marked = records.length;
  const attended = counts.present + counts.late;

  return {
    marked,
    ...counts,
    attended,
    rate: marked > 0 ? Math.round((attended / marked) * 100) : null,
  };
}

export type DailyRow = {
  student_id: string;
  date: string;
  status: AttendanceStatus;
};

export type TermAttendanceRollup = {
  /** Distinct days on which the class had a register. */
  daysOpened: number;
  /** Student id → days present or late. */
  presentByStudent: Map<string, number>;
};

/**
 * Turn daily register rows into the term totals a report card prints.
 *
 * `daysOpened` is class-wide: it is the number of distinct dates with a
 * register, not the number of rows. A student who was absent still contributes
 * to the days the school was open.
 */
export function computeTermRollup(rows: DailyRow[]): TermAttendanceRollup {
  const dates = new Set<string>();
  const presentByStudent = new Map<string, number>();

  for (const row of rows) {
    dates.add(row.date);
    if (row.status === "present" || row.status === "late") {
      presentByStudent.set(row.student_id, (presentByStudent.get(row.student_id) ?? 0) + 1);
    }
  }

  return { daysOpened: dates.size, presentByStudent };
}
