import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, resolveTemplateRows } from "@/lib/report-card";

export async function GET(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, classId)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });

  const supabase = getServiceClient();

  // Students (alphabetical by name)
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, student_id, photo_url, profiles(full_name)")
    .eq("school_id", school_id)
    .eq("class_id", classId);
  const students = (studentsRaw || [])
    .map((s: any) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return { id: s.id, admission_no: s.student_id || "", name: p?.full_name || "Unknown", photo_url: s.photo_url || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const studentIds = students.map((s) => s.id);

  // Subjects of the class
  const { data: classSubjects } = await supabase
    .from("class_subjects")
    .select("subject_id, subjects(name)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("is_active", true);
  const subjects = (classSubjects || []).map((cs: any) => {
    const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
    return { id: cs.subject_id, name: subj?.name || "Unknown" };
  });

  // Templates: components (for max), grading, psychomotor, affective
  const [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
    resolveTemplateRows(school_id, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, classId, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  // Scores + prep data
  let scores: any[] = [], attendance: any[] = [], psychomotorScores: any[] = [], affectiveScores: any[] = [], comments: any[] = [], adminComments: any[] = [];
  if (studentIds.length > 0) {
    const [scoresQ, attendanceQ, psychoQ, affQ, commentsQ, adminCommentsQ] = await Promise.all([
      supabase.from("student_scores").select("student_id, subject_id, component_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("attendance_records").select("student_id, days_school_opened, days_present, days_absent").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("psychomotor_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("affective_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("school_admin_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
    ]);
    scores = scoresQ.data || [];
    attendance = attendanceQ.data || [];
    psychomotorScores = psychoQ.data || [];
    affectiveScores = affQ.data || [];
    comments = commentsQ.data || [];
    adminComments = adminCommentsQ.data || [];
  }

  // Submission status + last audit + school info
  const [{ data: submission }, { data: lastAudit }, { data: school }] = await Promise.all([
    supabase.from("report_card_submissions").select("status, submitted_at, return_reason").eq("class_id", classId).eq("term_id", activeTerm.id).maybeSingle(),
    supabase.from("report_card_audit_logs").select("action, created_at, profiles(full_name)").eq("class_id", classId).eq("term_id", activeTerm.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("schools").select("name, logo_url, address").eq("id", school_id).single(),
  ]);

  return NextResponse.json({
    activeTerm,
    students,
    subjects,
    components: components.map((c: any) => ({ id: c.id, name: c.name, maximum_score: c.maximum_score })),
    gradingRows: gradingRows.map((g: any) => ({ grade: g.grade, minimum_score: g.minimum_score, maximum_score: g.maximum_score, remark: g.remark })),
    psychomotorTraits: psychomotorTraits.map((t: any) => ({ id: t.id, name: t.name })),
    affectiveTraits: affectiveTraits.map((t: any) => ({ id: t.id, name: t.name })),
    scores,
    attendance,
    psychomotorScores,
    affectiveScores,
    comments,
    adminComments,
    submission: submission || { status: "draft" },
    lastAudit: lastAudit || null,
    school: school || null,
  });
}
