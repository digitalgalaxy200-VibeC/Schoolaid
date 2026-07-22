import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { class_id, attendance = [], psychomotor = [], affective = [], comments = [] } = body;
  if (!class_id) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, class_id)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  // Lock check
  const { data: submission } = await supabase
    .from("report_card_submissions").select("status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Report cards are locked (submitted for approval)" }, { status: 423 });

  // Attendance validation: 0 ≤ present ≤ opened
  for (const a of attendance) {
    const opened = Number(a.days_school_opened), present = Number(a.days_present);
    if (!Number.isFinite(opened) || !Number.isFinite(present) || opened < 0 || present < 0 || present > opened) {
      return NextResponse.json({ error: "Invalid attendance: days present must be between 0 and days opened" }, { status: 400 });
    }
  }

  if (attendance.length > 0) {
    const { error } = await supabase.from("attendance_records").upsert(
      attendance.map((a: any) => ({
        school_id, term_id, student_id: a.student_id,
        days_school_opened: Number(a.days_school_opened),
        days_present: Number(a.days_present),
        days_absent: Number(a.days_school_opened) - Number(a.days_present),
      })),
      { onConflict: "student_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (psychomotor.length > 0) {
    const { error } = await supabase.from("psychomotor_scores").upsert(
      psychomotor.map((p: any) => ({ school_id, term_id, student_id: p.student_id, trait_id: p.trait_id, score: p.score })),
      { onConflict: "student_id,trait_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (affective.length > 0) {
    const { error } = await supabase.from("affective_scores").upsert(
      affective.map((p: any) => ({ school_id, term_id, student_id: p.student_id, trait_id: p.trait_id, score: p.score })),
      { onConflict: "student_id,trait_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (comments.length > 0) {
    const { error } = await supabase.from("teacher_comments").upsert(
      comments.map((c: any) => ({ school_id, term_id, student_id: c.student_id, comment: c.comment })),
      { onConflict: "student_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit
  const actions: string[] = [];
  if (attendance.length) actions.push("save_attendance");
  if (psychomotor.length || affective.length) actions.push("save_traits");
  if (comments.length) actions.push("save_remark");
  if (actions.length) {
    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id, term_id, user_id: userId,
      action: actions.join(","),
      details: { attendance: attendance.length, psychomotor: psychomotor.length, affective: affective.length, comments: comments.length },
    });
  }

  return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
}
