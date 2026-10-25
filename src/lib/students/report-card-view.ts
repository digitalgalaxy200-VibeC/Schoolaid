import type { ReportCardData } from "@/lib/types/report-card";
import type { StaffReportCardRecord } from "./staff-report-card";

/**
 * Maps the staff report-card record (the same shape the student report-card
 * route returns) to the `ReportCardData` props consumed by `ReportCardUI`.
 *
 * Extracted so the PDF in the Academic Records flow and any future preview
 * render exactly the same card. The calculation mirrors the student results
 * page: totals from the frozen term results, average against the grading
 * scale's maximum, and the overall grade from that scale.
 */
export function toReportCardData(record: StaffReportCardRecord): ReportCardData {
  const results = record.results;

  const grandTotal = results.reduce((sum, result) => sum + (Number(result.total_score) || 0), 0);
  const maxPossibleTotal =
    results.length > 0 ? (record.grading_scales[0]?.maximum_score || 100) * results.length : 0;
  const average = maxPossibleTotal > 0 ? (grandTotal / maxPossibleTotal) * 100 : 0;
  const overallGradeRow = record.grading_scales.find(
    (scale) => average >= Number(scale.minimum_score) && average <= Number(scale.maximum_score),
  );

  const componentMap = new Map<
    string,
    { id: string; name: string; max_score: number; order: number }
  >();
  for (const score of record.component_scores) {
    if (!componentMap.has(score.component_id)) {
      componentMap.set(score.component_id, {
        id: score.component_id,
        name: score.component_name || "Component",
        max_score: Number(score.max_score) || 0,
        order: Number(score.component_order) || 0,
      });
    }
  }

  // Older cards may not have component snapshots; the resolved template rows
  // still name the columns.
  if (componentMap.size === 0) {
    for (const component of record.components as Array<Record<string, unknown>>) {
      const id = String(component.id ?? "");
      if (!id) continue;
      componentMap.set(id, {
        id,
        name: String(component.name ?? "Component"),
        max_score: Number(component.maximum_score) || 0,
        order: Number(component.display_order) || 0,
      });
    }
  }

  const assessmentComponents = Array.from(componentMap.values()).sort(
    (a, b) => a.order - b.order,
  );

  return {
    school: {
      name: record.school?.name || "School",
      logo_url: record.school?.logo_url ?? null,
      address: record.school?.address ?? null,
      phone: record.school?.phone ?? null,
      email: record.school?.email ?? null,
      motto: record.school?.motto ?? null,
    },
    student: {
      name: record.student.full_name || "Student",
      admission_no: record.student.admission_number || "—",
      photo_url: record.student.photo_url ?? null,
      gender: record.student.gender ?? null,
      dob: record.student.dob ?? null,
    },
    classInfo: {
      className: record.student.class_name || "—",
      position: record.position ?? null,
      totalStudents: record.totalStudents || 0,
    },
    termInfo: {
      session: record.session || "Session",
      term: record.term || "Term",
    },
    academic: {
      assessmentComponents,
      subjects: results.map((result) => {
        const componentScores: Record<string, number | null> = {};
        for (const score of record.component_scores) {
          if (score.subject_id === result.subject_id) {
            componentScores[score.component_id] = score.score;
          }
        }
        return {
          id: result.id,
          name: result.subject_name,
          total_score: result.total_score,
          grade: result.grade,
          remark: result.remark,
          component_scores: componentScores,
        };
      }),
      grandTotal,
      average,
      overallGrade: overallGradeRow?.grade || "N/A",
      maxPossibleTotal,
    },
    attendance: {
      daysOpened: record.attendance?.days_school_opened ?? null,
      daysPresent: record.attendance?.days_present ?? null,
      daysAbsent: record.attendance?.days_absent ?? null,
    },
    traits: {
      psychomotor: record.psychomotor,
      affective: record.affective,
    },
    remarks: {
      teacher: record.teacher_comment,
      admin: record.admin_comment,
    },
    gradingScales: record.grading_scales,
    settings: record.settings as ReportCardData["settings"],
    isDraft: record.is_draft || record.is_retracted,
  };
}
