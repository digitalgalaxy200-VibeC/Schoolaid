import { describe, expect, it } from "vitest";
import {
  computeTermRollup,
  isAttendanceStatus,
  isFutureDate,
  isIsoDate,
  summarizeDaily,
  type DailyRow,
} from "@/lib/attendance/daily";

describe("attendance dates", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2026-09-07")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("07/09/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("treats a later date as a future register", () => {
    expect(isFutureDate("2026-09-08", "2026-09-07")).toBe(true);
    expect(isFutureDate("2026-09-07", "2026-09-07")).toBe(false);
    expect(isFutureDate("2026-09-06", "2026-09-07")).toBe(false);
  });

  it("accepts only the four register statuses", () => {
    for (const status of ["present", "absent", "late", "excused"]) {
      expect(isAttendanceStatus(status)).toBe(true);
    }
    expect(isAttendanceStatus("sick")).toBe(false);
    expect(isAttendanceStatus(null)).toBe(false);
  });
});

describe("summarizeDaily", () => {
  it("counts everyone and treats late as attended", () => {
    expect(
      summarizeDaily([
        { status: "present" },
        { status: "present" },
        { status: "late" },
        { status: "absent" },
        { status: "excused" },
      ]),
    ).toEqual({
      marked: 5,
      present: 2,
      absent: 1,
      late: 1,
      excused: 1,
      attended: 3,
      rate: 60,
    });
  });

  it("reports no rate when nothing is marked", () => {
    expect(summarizeDaily([])).toMatchObject({ marked: 0, attended: 0, rate: null });
  });
});

describe("computeTermRollup", () => {
  const rows: DailyRow[] = [
    { student_id: "s1", date: "2026-09-07", status: "present" },
    { student_id: "s1", date: "2026-09-08", status: "late" },
    { student_id: "s1", date: "2026-09-09", status: "absent" },
    { student_id: "s2", date: "2026-09-07", status: "absent" },
    { student_id: "s2", date: "2026-09-08", status: "present" },
    { student_id: "s2", date: "2026-09-09", status: "excused" },
  ];

  it("counts distinct days, not rows, as days opened", () => {
    expect(computeTermRollup(rows).daysOpened).toBe(3);
  });

  it("counts present and late as days present per student", () => {
    const rollup = computeTermRollup(rows);
    expect(rollup.presentByStudent.get("s1")).toBe(2); // present + late
    expect(rollup.presentByStudent.get("s2")).toBe(1); // present only
  });

  it("returns zero days opened for an empty register", () => {
    expect(computeTermRollup([])).toMatchObject({ daysOpened: 0 });
  });
});
