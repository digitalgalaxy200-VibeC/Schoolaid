import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, resolveTemplateRows } from "@/lib/report-card";

export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  // Impersonated super admin: skip teacher checks, allow any class
  if (!all_classes) {
    const teacher = await getTeacherByProfile(userId);
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    if (!(await isClassTeacher(school_id, teacher.id, classId)))
      return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });
  }

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });

  const supabase = getServiceClient();

  // Students (alphabetical by name, active only)
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, student_id, photo_url, profiles!inner(full_name, is_active)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("profiles.is_active", true);
  const students = (studentsRaw || [])
    .map((s: any) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return { id: s.id, student_id: s.student_id, photo_url: s.photo_url, name: p?.full_name || "Unknown" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Subjects and grading
  const classSubjects = await getClassSubjects(school_id, classId);
  const [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
    resolveTemplateRows(school_id, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, classId, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  const termId = activeTerm.id;

  // Scores, traits, attendance, comments (in parallel)
  const [scoresRes, psychoRes, affRes, attendRes, commentsRes, submissionRes, schoolRes, settingsRes, lastAuditRes] = await Promise.all([
    supabase.from("student_scores").select("*").eq("school_id", school_id).eq("term_id", termId).in("student_id", students.map(s => s.id)),
    supabase.from("psychomotor_scores").select("*").eq("school_id", school_id).eq("term_id", termId).in("student_id", students.map(s => s.id)),
    supabase.from("affective_scores").select("*").eq("school_id", school_id).eq("term_id", termId).in("student_id", students.map(s => s.id)),
    supabase.from("attendance_records").select("*").eq("school_id", school_id).eq("term_id", termId).in("student_id", students.map(s => s.id)),
    supabase.from("teacher_comments").select("*").eq("school_id", school_id).eq("term_id", termId).in("student_id", students.map(s => s.id)),
    supabase.from("report_card_submissions").select("status, submitted_at, return_reason").eq("class_id", classId).eq("term_id", termId).maybeSingle(),
    supabase.from("schools").select("name, logo_url, address, email, phone, motto").eq("id", school_id).single(),
    supabase.from("report_card_settings").select("*").eq("school_id", school_id).maybeSingle(),
    supabase.from("report_card_audit_logs").select("action, created_at, profiles(full_name)").eq("class_id", classId).eq("term_id", termId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    students,
    subjects: classSubjects,
    components,
    gradingRows,
    psychomotorTraits,
    affectiveTraits,
    scores: scoresRes.data || [],
    psychomotorScores: psychoRes.data || [],
    affectiveScores: affRes.data || [],
    attendance: attendRes.data || [],
    comments: commentsRes.data || [],
    submission: submissionRes.data || { status: "draft" },
    school: schoolRes.data || null,
    settings: settingsRes.data || null,
    lastAudit: lastAuditRes.data || null,
  });
}

async function getClassSubjects(school_id: string, class_id: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("subject_id, subjects(name, code)")
    .eq("school_id", school_id)
    .eq("class_id", class_id)
    .eq("is_active", true);
  return (data || []).map((r: any) => {
    const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
    return { id: r.subject_id, name: s?.name || "Unknown", code: s?.code || "" };
  });
}
