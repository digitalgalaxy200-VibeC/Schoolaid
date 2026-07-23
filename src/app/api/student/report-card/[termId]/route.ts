import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { isTermApprovedForStudent } from "@/lib/report-card";

/**
 * Returns the complete published report card for a specific term.
 * Reads strictly from `term_results` snapshot (never live computation).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { termId } = await params;

  const supabase = getServiceClient();

  // Find the student
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, student_id, class_id")
    .eq("profile_id", userId)
    .single();

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // The class teacher's report card for this term must be School-Admin-approved
  // before any of it (even already-"published" subject scores) is exposed.
  const { approved } = await isTermApprovedForStudent(student.id, termId);
  if (!approved) {
    return NextResponse.json({
      student: { admission_number: student.student_id },
      school: {}, session: "", term: "", results: [], attendance: null,
      psychomotor: [], affective: [], teacher_comment: null, admin_comment: null,
      grading_scales: [], has_results: false,
    });
  }

  // Fetch everything in parallel
  const [
    { data: termResults },
    { data: attendance },
    { data: psychomotor },
    { data: affective },
    { data: teacherComment },
    { data: adminComment },
    { data: gradingScales },
    { data: psychoDefs },
    { data: affectiveDefs },
    { data: school },
    { data: term },
  ] = await Promise.all([
    supabase
      .from("term_results")
      .select("id, subject_id, total_score, grade, remark, last_edited_at, subjects(name)")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .eq("published", true),
    supabase
      .from("attendance_records")
      .select("days_school_opened, days_present, days_absent")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("psychomotor_scores")
      .select("trait_id, score")
      .eq("student_id", student.id)
      .eq("term_id", termId),
    supabase
      .from("affective_scores")
      .select("trait_id, score")
      .eq("student_id", student.id)
      .eq("term_id", termId),
    supabase
      .from("teacher_comments")
      .select("comment")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("school_admin_comments")
      .select("comment")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("grading_scales")
      .select("grade, remark, minimum_score, maximum_score")
      .eq("school_id", school_id)
      .order("minimum_score", { ascending: false }),
    supabase
      .from("psychomotor_definitions")
      .select("id, name")
      .eq("school_id", school_id)
      .order("display_order"),
    supabase
      .from("affective_definitions")
      .select("id, name")
      .eq("school_id", school_id)
      .order("display_order"),
    supabase
      .from("schools")
      .select("name, logo_url, address, phone, email, motto")
      .eq("id", school_id)
      .single(),
    supabase
      .from("academic_terms")
      .select("name, session_id")
      .eq("id", termId)
      .single(),
  ]);

  // Get session name
  let sessionName = "";
  if (term?.session_id) {
    const { data: sess } = await supabase
      .from("academic_sessions")
      .select("name")
      .eq("id", term.session_id)
      .single();
    sessionName = sess?.name || "";
  }

  // Build psychomotor/affective with labels
  const psychomotorItems = (psychomotor || []).map((p) => {
    const def = (psychoDefs || []).find((d) => d.id === p.trait_id);
    return { name: def?.name || "Unknown", score: p.score };
  });

  const affectiveItems = (affective || []).map((a) => {
    const def = (affectiveDefs || []).find((d) => d.id === a.trait_id);
    return { name: def?.name || "Unknown", score: a.score };
  });

  return NextResponse.json({
    student: {
      admission_number: student.student_id,
    },
    school: school || {},
    session: sessionName,
    term: term?.name || "",
    results: termResults || [],
    attendance: attendance || null,
    psychomotor: psychomotorItems,
    affective: affectiveItems,
    teacher_comment: teacherComment?.comment || null,
    admin_comment: adminComment?.comment || null,
    grading_scales: gradingScales || [],
    has_results: (termResults || []).length > 0,
  });
}
