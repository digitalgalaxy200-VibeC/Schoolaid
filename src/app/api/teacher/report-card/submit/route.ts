import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked, resolveTemplateRows } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { class_id, force } = await request.json();
  if (!class_id) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, class_id)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  const { data: submission } = await supabase
    .from("report_card_submissions").select("id, status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Already submitted" }, { status: 423 });

  // ── Readiness check (server-side, never trust the client) ──
  const { data: studentsRaw } = await supabase.from("students").select("id, full_name").eq("school_id", school_id).eq("class_id", class_id);
  const studentIds = (studentsRaw || []).map((s) => s.id);
  if (studentIds.length === 0) return NextResponse.json({ error: "No students in class" }, { status: 400 });

  // Only run validation if not forcing through
  if (!force) {
    const { data: classSubjects } = await supabase
      .from("class_subjects").select("subject_id, subjects(name)").eq("school_id", school_id).eq("class_id", class_id).eq("is_active", true);
    const [psychomotorTraits, affectiveTraits] = await Promise.all([
      resolveTemplateRows(school_id, class_id, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
      resolveTemplateRows(school_id, class_id, "class_affective_templates", "affective_templates", "affective_rows"),
    ]);

    const [{ data: scores }, { data: attendance }, { data: psycho }, { data: aff }, { data: comments }] = await Promise.all([
      supabase.from("student_scores").select("student_id, subject_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("attendance_records").select("student_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("psychomotor_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("affective_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    ]);

    // Find which specific students are incomplete
    const incompleteStudentIds = new Set<string>();

    for (const cs of (classSubjects || []) as any[]) {
      for (const sid of studentIds) {
        if (!(scores || []).some((sc) => sc.student_id === sid && sc.subject_id === cs.subject_id)) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    for (const sid of studentIds) {
      if (!(attendance || []).some((a) => a.student_id === sid)) incompleteStudentIds.add(sid);
    }
    if (psychomotorTraits.length > 0) {
      for (const sid of studentIds) {
        if (!psychomotorTraits.every((t: any) => (psycho || []).some((p) => p.student_id === sid && p.trait_id === t.id))) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    if (affectiveTraits.length > 0) {
      for (const sid of studentIds) {
        if (!affectiveTraits.every((t: any) => (aff || []).some((p) => p.student_id === sid && p.trait_id === t.id))) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    for (const sid of studentIds) {
      if (!(comments || []).some((c) => c.student_id === sid && c.comment?.trim())) incompleteStudentIds.add(sid);
    }

    if (incompleteStudentIds.size > 0) {
      // Map IDs back to names for the frontend
      const incompleteStudents = (studentsRaw || [])
        .filter((s) => incompleteStudentIds.has(s.id))
        .map((s) => ({ id: s.id, name: s.full_name }));

      return NextResponse.json(
        { error: "Submission incomplete", incompleteStudents },
        { status: 422 }
      );
    }
  }

  // ── Transition ──
  const now = new Date().toISOString();
  const { error } = await supabase.from("report_card_submissions").upsert(
    { school_id, class_id, term_id, status: "pending_approval", submitted_by: userId, submitted_at: now, return_reason: null },
    { onConflict: "class_id,term_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id, term_id, user_id: userId, action: "submit", details: { students: studentIds.length, forced: !!force },
  });

  return NextResponse.json({ success: true, status: "pending_approval" });
}
