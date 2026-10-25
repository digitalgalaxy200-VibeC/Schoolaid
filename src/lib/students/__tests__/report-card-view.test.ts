import { describe, it, expect } from "vitest";
import { toReportCardData } from "../report-card-view";
import type { StaffReportCardRecord } from "../staff-report-card";

const record = (over: Partial<StaffReportCardRecord> = {}): StaffReportCardRecord => ({
  student: {
    full_name: "Jane Doe",
    admission_number: "ADM-0001",
    photo_url: null,
    gender: "female",
    dob: "2015-04-01",
    class_name: "Basic 3",
  },
  school: {
    name: "Example School",
    logo_url: null,
    address: "1 School Road",
    phone: null,
    email: null,
    motto: null,
  },
  session: "2025/2026",
  term: "First Term",
  position: 2,
  totalStudents: 30,
  results: [
    {
      id: "r1",
      subject_id: "s1",
      subject_name: "Mathematics",
      subject_code: "MTH",
      total_score: 80,
      grade: "A",
      remark: "Excellent",
      published: true,
    },
    {
      id: "r2",
      subject_id: "s2",
      subject_name: "English",
      subject_code: "ENG",
      total_score: 60,
      grade: "C",
      remark: null,
      published: true,
    },
  ],
  components: [],
  component_scores: [
    {
      subject_id: "s1",
      component_id: "c1",
      component_name: "CA1",
      component_order: 1,
      max_score: 40,
      score: 30,
    },
    {
      subject_id: "s1",
      component_id: "c2",
      component_name: "Exam",
      component_order: 2,
      max_score: 60,
      score: 50,
    },
    {
      subject_id: "s2",
      component_id: "c1",
      component_name: "CA1",
      component_order: 1,
      max_score: 40,
      score: 30,
    },
  ],
  attendance: { days_school_opened: 60, days_present: 58, days_absent: 2 },
  psychomotor: [{ name: "Handwriting", score: 4 }],
  affective: [{ name: "Punctuality", score: 5 }],
  teacher_comment: "A good term.",
  admin_comment: "Keep it up.",
  grading_scales: [
    { grade: "A", minimum_score: 70, maximum_score: 100, remark: "Excellent" },
    { grade: "C", minimum_score: 50, maximum_score: 69, remark: "Good" },
    { grade: "F", minimum_score: 0, maximum_score: 49, remark: "Fail" },
  ],
  settings: null,
  has_results: true,
  is_draft: false,
  submission_status: "published",
  is_retracted: false,
  retraction_reason: null,
  ...over,
});

describe("toReportCardData", () => {
  it("builds the full card from the final result rows", () => {
    const data = toReportCardData(record());

    expect(data.student).toMatchObject({ name: "Jane Doe", admission_no: "ADM-0001" });
    expect(data.classInfo).toEqual({ className: "Basic 3", position: 2, totalStudents: 30 });
    expect(data.termInfo).toEqual({ session: "2025/2026", term: "First Term" });

    expect(data.academic.subjects.map((subject) => subject.name)).toEqual([
      "Mathematics",
      "English",
    ]);
    expect(data.academic.subjects[0].component_scores).toEqual({ c1: 30, c2: 50 });
    expect(data.academic.grandTotal).toBe(140);
    // 140 out of 200
    expect(data.academic.average).toBe(70);
    expect(data.academic.overallGrade).toBe("A");
    expect(data.academic.assessmentComponents.map((component) => component.name)).toEqual([
      "CA1",
      "Exam",
    ]);
  });

  it("falls back to the resolved component template when no component scores were stored", () => {
    const data = toReportCardData(
      record({
        component_scores: [],
        components: [
          { id: "c1", name: "CA1", maximum_score: 40, display_order: 1 },
          { id: "c2", name: "Exam", maximum_score: 60, display_order: 2 },
        ],
      }),
    );

    expect(data.academic.assessmentComponents).toEqual([
      { id: "c1", name: "CA1", max_score: 40, order: 1 },
      { id: "c2", name: "Exam", max_score: 60, order: 2 },
    ]);
  });

  it("marks an unpublished final snapshot as a draft", () => {
    const data = toReportCardData(record({ is_draft: true }));
    expect(data.isDraft).toBe(true);
  });
});
