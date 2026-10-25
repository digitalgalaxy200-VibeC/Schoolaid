import { getServiceClient } from "@/lib/supabase/service";
import { resolveTemplateRows } from "@/lib/report-card";
import {
  computePositions,
  readConfigurationSnapshot,
  resolveCardConfiguration,
} from "@/lib/report-card-snapshot";

/**
 * The full report-card record for one student and one term, for STAFF.
 *
 * This is the same data the student's report-card page reads, assembled for an
 * administrator or class teacher so a report card can be rendered as a PDF
 * without impersonating the student. It reads the FINAL `term_results` snapshot
 * only — never live scores — and honours the configuration snapshot captured at
 * publication, so an issued card never changes when a school edits its grading
 * bands afterwards.
 *
 * `is_draft` is true for a final snapshot that has not been published yet, so
 * staff can still produce a preview; the term list only offers terms that have
 * final results.
 */

type Db = ReturnType<typeof getServiceClient>;

export type StaffReportCardRecord = {
  student: {
    full_name: string | null;
    admission_number: string | null;
    photo_url: string | null;
    gender: string | null;
    dob: string | null;
    class_name: string | null;
  };
  school: {
    name: string;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    motto: string | null;
  } | null;
  session: string;
  term: string;
  position: number | null;
  totalStudents: number;
  results: Array<{
    id: string;
    subject_id: string | null;
    subject_name: string;
    subject_code: string | null;
    total_score: number;
    grade: string;
    remark: string | null;
    published: boolean;
  }>;
  components: unknown[];
  component_scores: Array<{
    subject_id: string | null;
    component_id: string;
    component_name: string | null;
    component_order: number | null;
    max_score: number | null;
    score: number | null;
  }>;
  attendance: {
    days_school_opened: number | null;
    days_present: number | null;
    days_absent: number | null;
  } | null;
  psychomotor: Array<{ name: string; score: number | string }>;
  affective: Array<{ name: string; score: number | string }>;
  teacher_comment: string | null;
  admin_comment: string | null;
  grading_scales: Array<{
    grade: string;
    minimum_score: number;
    maximum_score: number;
    remark: string | null;
    principal_remark?: string | null;
  }>;
  settings: Record<string, unknown> | null;
  has_results: boolean;
  is_draft: boolean;
  submission_status: string | null;
  is_retracted: boolean;
  retraction_reason: string | null;
};

export type LoadStaffReportCardResult =
  | { ok: true; data: StaffReportCardRecord }
  | { ok: false; status: number; error: string };

type ProfileJoin = { full_name: string | null };
type ClassJoin = { name: string | null };

function joined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadStaffReportCard(
  db: Db,
  params: { school_id: string; student_id: string; term_id: string },
): Promise<LoadStaffReportCardResult> {
  const { school_id, student_id, term_id } = params;

  const [studentRes, termRes] = await Promise.all([
    db
      .from("students")
      .select(
        "id, student_id, class_id, photo_url, gender, date_of_birth, classes(name), profiles(full_name)",
      )
      .eq("id", student_id)
      .eq("school_id", school_id)
      .maybeSingle(),
    db
      .from("academic_terms")
      .select("id, name, session_id")
      .eq("id", term_id)
      .eq("school_id", school_id)
      .maybeSingle(),
  ]);

  const student = studentRes.data as Record<string, unknown> | null;
  const term = termRes.data as
    | { id: string; name: string | null; session_id: string | null }
    | null;

  if (!student) {
    return { ok: false, status: 404, error: "Student not found in this school" };
  }
  if (!term) {
    return { ok: false, status: 404, error: "Term not found in this school" };
  }

  const profile = joined(student.profiles as ProfileJoin | ProfileJoin[] | null);
  const cls = joined(student.classes as ClassJoin | ClassJoin[] | null);

  // ── The final results for this term ───────────────────────────────────────
  const { data: resultRows, error: resultError } = await db
    .from("term_results")
    .select(
      "id, subject_id, subject_name, subject_code, total_score, grade, remark, published, class_id, subjects(name)",
    )
    .eq("school_id", school_id)
    .eq("student_id", student_id)
    .eq("term_id", term_id);
  if (resultError) return { ok: false, status: 500, error: resultError.message };

  const rows = (resultRows || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    return { ok: false, status: 404, error: "No final results exist for this term" };
  }

  const results = rows.map((row) => {
    const subject = joined(row.subjects as { name?: string | null } | { name?: string | null }[] | null);
    return {
      id: row.id as string,
      subject_id: (row.subject_id as string | null) ?? null,
      subject_name: (row.subject_name as string | null) || subject?.name || "Subject",
      subject_code: (row.subject_code as string | null) ?? null,
      total_score: Number(row.total_score) || 0,
      grade: (row.grade as string | null) || "—",
      remark: (row.remark as string | null) ?? null,
      published: row.published === true,
    };
  });

  // The class that produced these results. A promoted student's current class
  // is not necessarily the class whose report card this is.
  const publishedClassId =
    (rows.find((row) => row.class_id)?.class_id as string | undefined) ||
    (student.class_id as string | null) ||
    "";

  // ── Everything else the card renders ──────────────────────────────────────
  const [attendanceRes, psychoRes, affRes, teacherRes, adminRes, schoolRes, componentsRes, settingsRes, submissionRes, sessionRes] =
    await Promise.all([
      db
        .from("attendance_records")
        .select("days_school_opened, days_present, days_absent")
        .eq("student_id", student_id)
        .eq("term_id", term_id)
        .maybeSingle(),
      db
        .from("psychomotor_scores")
        .select("trait_id, score")
        .eq("student_id", student_id)
        .eq("term_id", term_id),
      db
        .from("affective_scores")
        .select("trait_id, score")
        .eq("student_id", student_id)
        .eq("term_id", term_id),
      db
        .from("teacher_comments")
        .select("comment")
        .eq("student_id", student_id)
        .eq("term_id", term_id)
        .maybeSingle(),
      db
        .from("school_admin_comments")
        .select("comment")
        .eq("student_id", student_id)
        .eq("term_id", term_id)
        .maybeSingle(),
      db
        .from("schools")
        .select("name, logo_url, address, phone, email, motto")
        .eq("id", school_id)
        .maybeSingle(),
      db
        .from("term_result_components")
        .select("subject_id, component_id, component_name, component_order, max_score, score")
        .eq("student_id", student_id)
        .eq("term_id", term_id),
      db.from("report_card_settings").select("*").eq("school_id", school_id).maybeSingle(),
      publishedClassId
        ? db
            .from("report_card_submissions")
            .select("status, retraction_reason")
            .eq("school_id", school_id)
            .eq("class_id", publishedClassId)
            .eq("term_id", term_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      term.session_id
        ? db
            .from("academic_sessions")
            .select("name")
            .eq("id", term.session_id)
            .eq("school_id", school_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  // ── Position and roster size ──────────────────────────────────────────────
  let position: number | null = null;
  let totalStudents = 0;
  if (publishedClassId) {
    const { data: roster } = await db
      .from("students")
      .select("id")
      .eq("school_id", school_id)
      .eq("class_id", publishedClassId);
    const rosterIds = (roster || []).map((row) => row.id as string);
    totalStudents = rosterIds.length;

    if (rosterIds.length > 0) {
      const { data: classResults } = await db
        .from("term_results")
        .select("student_id, total_score")
        .eq("school_id", school_id)
        .eq("term_id", term_id)
        .in("student_id", rosterIds);
      const positions = computePositions(
        (classResults || []) as { student_id: string; total_score: number | string | null }[],
      );
      position = positions[student_id] ?? null;
    }
  }

  // ── Configuration: publication snapshot first, live templates second ─────
  let components: Record<string, unknown>[] = [];
  let gradingRows: Record<string, unknown>[] = [];
  let psychomotorTraits: Record<string, unknown>[] = [];
  let affectiveTraits: Record<string, unknown>[] = [];

  if (publishedClassId) {
    [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
      resolveTemplateRows(
        school_id,
        publishedClassId,
        "class_components_templates",
        "components_templates",
        "components_rows",
        "display_order",
        db,
      ),
      resolveTemplateRows(
        school_id,
        publishedClassId,
        "class_grading_templates",
        "grading_templates",
        "grading_rows",
        "minimum_score",
        db,
      ),
      resolveTemplateRows(
        school_id,
        publishedClassId,
        "class_psychomotor_templates",
        "psychomotor_templates",
        "psychomotor_rows",
        "display_order",
        db,
      ),
      resolveTemplateRows(
        school_id,
        publishedClassId,
        "class_affective_templates",
        "affective_templates",
        "affective_rows",
        "display_order",
        db,
      ),
    ]);
  }

  const snapshot = publishedClassId
    ? await readConfigurationSnapshot(db, school_id, publishedClassId, term_id)
    : null;

  const settings = (settingsRes.data as Record<string, unknown> | null) ?? null;
  const card = resolveCardConfiguration({
    studentId: student_id,
    snapshot,
    live: {
      components,
      gradingScale: gradingRows,
      psychomotorTraits,
      affectiveTraits,
      settings,
      position,
      classSize: totalStudents,
    },
  });

  const gradingScales = [...(card.gradingScale as Array<Record<string, unknown>>)]
    .sort((a, b) => Number(b.minimum_score) - Number(a.minimum_score))
    .map((row) => ({
      grade: String(row.grade ?? ""),
      minimum_score: Number(row.minimum_score) || 0,
      maximum_score: Number(row.maximum_score) || 0,
      remark: (row.remark as string | null) ?? null,
      principal_remark: (row.principal_remark as string | null) ?? null,
    }));

  const psychomotor = (card.psychomotorTraits as Array<Record<string, unknown>>).map((trait) => {
    const score = (psychoRes.data || []).find((row) => row.trait_id === trait.id)?.score;
    return { name: (trait.name as string) || "Unknown", score: score ?? 0 };
  });

  const affective = (card.affectiveTraits as Array<Record<string, unknown>>).map((trait) => {
    const score = (affRes.data || []).find((row) => row.trait_id === trait.id)?.score;
    return { name: (trait.name as string) || "Unknown", score: score ?? 0 };
  });

  const submission = submissionRes.data as
    | { status: string | null; retraction_reason: string | null }
    | null;

  return {
    ok: true,
    data: {
      student: {
        full_name: profile?.full_name ?? null,
        admission_number: (student.student_id as string | null) ?? null,
        photo_url: (student.photo_url as string | null) ?? null,
        gender: (student.gender as string | null) ?? null,
        dob: (student.date_of_birth as string | null) ?? null,
        class_name: cls?.name ?? null,
      },
      school: (schoolRes.data as StaffReportCardRecord["school"]) ?? null,
      session: (sessionRes.data?.name as string | undefined) ?? "",
      term: term.name || "",
      position: card.position,
      totalStudents: card.classSize,
      results,
      components: card.components,
      component_scores: (componentsRes.data || []).map((row) => ({
        subject_id: (row.subject_id as string | null) ?? null,
        component_id: row.component_id as string,
        component_name: (row.component_name as string | null) ?? null,
        component_order: (row.component_order as number | null) ?? null,
        max_score: (row.max_score as number | null) ?? null,
        score: (row.score as number | null) ?? null,
      })),
      attendance: (attendanceRes.data as StaffReportCardRecord["attendance"]) ?? null,
      psychomotor,
      affective,
      teacher_comment: (teacherRes.data?.comment as string | undefined) ?? null,
      admin_comment: (adminRes.data?.comment as string | undefined) ?? null,
      grading_scales: gradingScales,
      settings: card.settings ?? null,
      has_results: results.length > 0,
      // The card is a draft unless every final row was published, matching the
      // badge the Academic Records term list shows.
      is_draft: !results.every((result) => result.published),
      submission_status: submission?.status ?? null,
      is_retracted: submission?.status === "retracted",
      retraction_reason: submission?.retraction_reason ?? null,
    },
  };
}
