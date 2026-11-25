import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  type ReadinessInput,
  type ScoreRow,
} from "@/lib/school-admin/dashboard-summary";

function classInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    classId: "class-a",
    className: "JSS 1A",
    studentIds: ["s1", "s2"],
    subjectIds: ["math", "english"],
    componentIds: ["ca1", "exam"],
    ...overrides,
  };
}

function score(
  studentId: string,
  subjectId: string | null,
  componentId: string | null,
): ScoreRow {
  return {
    student_id: studentId,
    subject_id: subjectId,
    assessment_component_id: componentId,
  };
}

describe("computeReadiness", () => {
  it("counts entered marks against students × subjects × components", () => {
    const rows = computeReadiness(
      [classInput()],
      [
        score("s1", "math", "ca1"),
        score("s1", "math", "exam"),
        score("s2", "english", "ca1"),
        score("s2", "english", "exam"),
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentCount: 2,
      subjectCount: 2,
      componentCount: 2,
      expected: 8,
      entered: 4,
      percent: 50,
    });
  });

  it("ignores rows from another class, subject or component", () => {
    const rows = computeReadiness(
      [classInput()],
      [
        score("outsider", "math", "ca1"),
        score("s1", "science", "ca1"),
        score("s1", "math", "project"),
        score("s1", null, "ca1"),
        score("s1", "math", null),
      ],
    );

    expect(rows[0].entered).toBe(0);
    expect(rows[0].percent).toBe(0);
  });

  it("counts a student/component pair once even if rows repeat", () => {
    const rows = computeReadiness(
      [classInput()],
      [
        score("s1", "math", "ca1"),
        score("s1", "math", "ca1"),
        score("s1", "english", "ca1"),
      ],
    );

    expect(rows[0].entered).toBe(2);
  });

  it("reports not-measured when the class is not configured", () => {
    const rows = computeReadiness(
      [
        classInput({ studentIds: [], subjectIds: [], componentIds: [] }),
        classInput({ classId: "class-b", className: "JSS 2A", subjectIds: [] }),
      ],
      [],
    );

    expect(rows[0].percent).toBeNull();
    expect(rows[0].expected).toBe(0);
    expect(rows[1].percent).toBeNull();
  });

  it("never reports more than 100%", () => {
    const rows = computeReadiness(
      [classInput({ studentIds: ["s1"], subjectIds: ["math"], componentIds: ["ca1"] })],
      [
        score("s1", "math", "ca1"),
        score("s1", "math", "ca1"),
        score("s1", "math", "ca1"),
      ],
    );

    expect(rows[0].percent).toBe(100);
  });

  it("sorts classes naturally by name", () => {
    const rows = computeReadiness(
      [
        classInput({ classId: "c10", className: "JSS 10" }),
        classInput({ classId: "c2", className: "JSS 2" }),
        classInput({ classId: "c1", className: "JSS 1" }),
      ],
      [],
    );

    expect(rows.map((row) => row.className)).toEqual(["JSS 1", "JSS 2", "JSS 10"]);
  });
});
