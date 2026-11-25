import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { buildSetupReport } from "@/lib/school-setup/status";
import {
  computeReadiness,
  type DashboardSummary,
  type ReadinessInput,
  type ScoreRow,
} from "@/lib/school-admin/dashboard-summary";
import { getTermProgress, schoolTodayISO } from "@/lib/school-admin/term";
import { summarizeDaily, type AttendanceStatus } from "@/lib/attendance/daily";

/**
 * GET /api/school-admin/dashboard/summary
 *
 * The Home screen's real numbers, in one request:
 *   - the active session/term and the week of term,
 *   - classes missing marks (readiness), and report cards awaiting approval,
 *   - students with no class,
 *   - the setup checklist.
 *
 * Fees are deliberately NOT here: the finance dashboard already owns that
 * arithmetic, and Home asks it for the active term. Re-implementing billed vs
 * collected in a second place is how the two screens start disagreeing.
 *
 * Every query is scoped to the verified session's school_id. Nothing in the
 * request body or query string can name another school.
 */
export async function GET() {
  const { authorized, school_id, impersonated } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [
    schoolRes,
    termRes,
    classesRes,
    studentsRes,
    teachersRes,
    classSubjectsRes,
    classTemplatesRes,
    levelTemplatesRes,
    componentTemplatesRes,
  ] = await Promise.all([
    supabase.from("schools").select("name, motto, slug").eq("id", school_id).maybeSingle(),
    supabase
      .from("academic_terms")
      .select("id, name, start_date, end_date, session_id")
      .eq("school_id", school_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("classes")
      .select("id, name, academic_level_id")
      .eq("school_id", school_id)
      .order("name"),
    supabase
      .from("students")
      .select("id, class_id, profiles!inner(is_active)")
      .eq("school_id", school_id)
      .eq("profiles.is_active", true),
    supabase
      .from("teachers")
      .select("id, profiles!inner(is_active)")
      .eq("school_id", school_id)
      .eq("profiles.is_active", true),
    supabase
      .from("class_subjects")
      .select("class_id, subject_id")
      .eq("school_id", school_id)
      .eq("is_active", true),
    supabase
      .from("class_components_templates")
      .select("class_id, template_id")
      .eq("school_id", school_id),
    supabase
      .from("level_components_templates")
      .select("level_id, template_id")
      .eq("school_id", school_id),
    supabase.from("components_templates").select("id").eq("school_id", school_id),
  ]);

  if (classesRes.error) {
    return NextResponse.json({ error: classesRes.error.message }, { status: 500 });
  }
  if (studentsRes.error) {
    return NextResponse.json({ error: studentsRes.error.message }, { status: 500 });
  }

  const school = schoolRes.data as {
    name?: string;
    motto?: string | null;
    slug?: string | null;
  } | null;
  const termRow = termRes.data as {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    session_id: string | null;
  } | null;

  const classes = (classesRes.data || []) as {
    id: string;
    name: string;
    academic_level_id: string | null;
  }[];
  const students = (studentsRes.data || []) as { id: string; class_id: string | null }[];
  const classSubjects = (classSubjectsRes.data || []) as {
    class_id: string;
    subject_id: string;
  }[];
  const classTemplates = (classTemplatesRes.data || []) as {
    class_id: string;
    template_id: string;
  }[];
  const levelTemplates = (levelTemplatesRes.data || []) as {
    level_id: string;
    template_id: string;
  }[];
  const componentTemplates = (componentTemplatesRes.data || []) as { id: string }[];

  // Resolve the component rows for every template any class could point at.
  const templateIds = Array.from(
    new Set([
      ...classTemplates.map((row) => row.template_id),
      ...levelTemplates.map((row) => row.template_id),
      ...componentTemplates.map((row) => row.id),
    ]),
  );

  const componentRowsRes = templateIds.length
    ? await supabase
        .from("components_rows")
        .select("id, template_id")
        .in("template_id", templateIds)
    : { data: [] as { id: string; template_id: string }[] };

  const componentRows = (componentRowsRes.data || []) as {
    id: string;
    template_id: string;
  }[];

  const classTemplateMap = new Map<string, string>();
  for (const row of classTemplates) classTemplateMap.set(row.class_id, row.template_id);
  const levelTemplateMap = new Map<string, string>();
  for (const row of levelTemplates) levelTemplateMap.set(row.level_id, row.template_id);
  const defaultTemplateId = componentTemplates[0]?.id ?? null;
  const rowsByTemplate = new Map<string, string[]>();
  for (const row of componentRows) {
    const rows = rowsByTemplate.get(row.template_id);
    if (rows) rows.push(row.id);
    else rowsByTemplate.set(row.template_id, [row.id]);
  }

  const subjectsByClass = new Map<string, string[]>();
  for (const row of classSubjects) {
    const subjects = subjectsByClass.get(row.class_id);
    if (subjects) subjects.push(row.subject_id);
    else subjectsByClass.set(row.class_id, [row.subject_id]);
  }

  const studentsByClass = new Map<string, string[]>();
  let studentsWithoutClass = 0;
  for (const student of students) {
    if (!student.class_id) {
      studentsWithoutClass += 1;
      continue;
    }
    const list = studentsByClass.get(student.class_id);
    if (list) list.push(student.id);
    else studentsByClass.set(student.class_id, [student.id]);
  }

  const readinessInputs: ReadinessInput[] = classes.map((cls) => {
    const templateId =
      classTemplateMap.get(cls.id) ??
      (cls.academic_level_id ? levelTemplateMap.get(cls.academic_level_id) : undefined) ??
      defaultTemplateId;

    return {
      classId: cls.id,
      className: cls.name,
      studentIds: studentsByClass.get(cls.id) ?? [],
      subjectIds: subjectsByClass.get(cls.id) ?? [],
      componentIds: templateId ? rowsByTemplate.get(templateId) ?? [] : [],
    };
  });

  let sessionName = "";
  if (termRow?.session_id) {
    const { data: session } = await supabase
      .from("academic_sessions")
      .select("name")
      .eq("id", termRow.session_id)
      .maybeSingle();
    sessionName = (session as { name?: string } | null)?.name || "";
  }

  const today = schoolTodayISO();

  const [scoresRes, submissionsRes, attendanceRes, setupReport] = await Promise.all([
    termRow
      ? supabase
          .from("student_scores")
          .select("student_id, subject_id, assessment_component_id")
          .eq("school_id", school_id)
          .eq("term_id", termRow.id)
      : Promise.resolve({ data: [] as ScoreRow[] }),
    termRow
      ? supabase
          .from("report_card_submissions")
          .select("class_id, status, submitted_at, submitted_by")
          .eq("school_id", school_id)
          .eq("term_id", termRow.id)
      : Promise.resolve({
          data: [] as {
            class_id: string;
            status: string | null;
            submitted_at: string | null;
            submitted_by: string | null;
          }[],
        }),
    supabase
      .from("attendance")
      .select("student_id, class_id, status")
      .eq("school_id", school_id)
      .eq("date", today),
    buildSetupReport(supabase, school_id).catch((err) => {
      console.error("[dashboard-summary] setup report failed:", err);
      return null;
    }),
  ]);

  const readiness = termRow
    ? computeReadiness(readinessInputs, (scoresRes.data || []) as ScoreRow[])
    : [];

  const classNames = new Map(classes.map((cls) => [cls.id, cls.name]));
  const pending = ((submissionsRes.data || []) as {
    class_id: string;
    status: string | null;
    submitted_at: string | null;
    submitted_by: string | null;
  }[]).filter((submission) => submission.status === "pending_approval");

  const submitterIds = Array.from(
    new Set(pending.map((submission) => submission.submitted_by).filter(Boolean)),
  ) as string[];
  const submitterNames = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", submitterIds);
    for (const profile of (profiles || []) as { id: string; full_name: string | null }[]) {
      if (profile.full_name) submitterNames.set(profile.id, profile.full_name);
    }
  }

  const daily = summarizeDaily(
    ((attendanceRes.data || []) as { status: AttendanceStatus }[]),
  );
  const markedClassIds = new Set(
    ((attendanceRes.data || []) as { class_id: string }[]).map((row) => row.class_id),
  );
  const unmarkedClasses = classes
    .filter(
      (cls) =>
        (studentsByClass.get(cls.id)?.length ?? 0) > 0 && !markedClassIds.has(cls.id),
    )
    .map((cls) => ({
      classId: cls.id,
      className: cls.name,
      studentCount: studentsByClass.get(cls.id)?.length ?? 0,
    }));

  const term: DashboardSummary["term"] = termRow
    ? {
        id: termRow.id,
        name: termRow.name,
        startDate: termRow.start_date,
        endDate: termRow.end_date,
        sessionName,
        progress: getTermProgress(termRow.start_date, termRow.end_date, today),
      }
    : null;

  const setup: DashboardSummary["setup"] = setupReport
    ? {
        percent: setupReport.counts.percent,
        state: setupReport.state,
        requiredComplete: setupReport.counts.requiredComplete,
        requiredTotal: setupReport.counts.requiredTotal,
        next: setupReport.items
          .filter(
            (item) =>
              item.requirement === "required" &&
              (item.status === "incomplete" || item.status === "blocked"),
          )
          .slice(0, 4)
          .map((item) => ({
            id: item.id,
            label: item.label,
            detail: item.detail,
            href: item.href,
            action: item.action,
          })),
      }
    : null;

  const payload: DashboardSummary = {
    school: {
      name: school?.name || "School",
      motto: school?.motto ?? null,
      slug: school?.slug ?? null,
    },
    impersonated: !!impersonated,
    term,
    counts: {
      classes: classes.length,
      teachers: (teachersRes.data || []).length,
      students: students.length,
    },
    needsAttention: {
      pendingReportCards: pending.map((submission) => ({
        classId: submission.class_id,
        className: classNames.get(submission.class_id) || "Unknown class",
        submittedAt: submission.submitted_at,
        submittedBy: submission.submitted_by
          ? submitterNames.get(submission.submitted_by) || null
          : null,
      })),
      studentsWithoutClass,
    },
    readiness,
    attendance: {
      date: today,
      marked: daily.marked,
      present: daily.present,
      absent: daily.absent,
      late: daily.late,
      excused: daily.excused,
      rate: daily.rate,
      unmarkedClasses,
    },
    setup,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
