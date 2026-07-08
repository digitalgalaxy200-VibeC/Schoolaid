import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { term_id, subject_id, class_id, assignment_id } = await request.json();
  if (!term_id || !subject_id || !class_id) return NextResponse.json({ error: "term_id, subject_id, class_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Check can_publish
  const { data: assignment } = await supabase.from("teacher_subjects").select("can_publish").eq("id", assignment_id).eq("school_id", school_id).single();
  if (!assignment?.can_publish) return NextResponse.json({ error: "You don't have permission to publish" }, { status: 403 });

  // Get students, scores, components, grading
  const { data: students } = await supabase.from("students").select("id").eq("school_id", school_id).eq("class_id", class_id);
  const { data: components } = await supabase.from("assessment_components").select("*").eq("school_id", school_id);
  const { data: scores } = await supabase.from("student_scores").select("*").eq("school_id", school_id).eq("term_id", term_id);
  const { data: grading } = await supabase.from("grading_scales").select("*").eq("school_id", school_id);

  if (!students?.length) return NextResponse.json({ error: "No students in class" }, { status: 400 });

  // Compute and snapshot each student's result
  for (const student of students) {
    const studentScores = (scores || []).filter(s => s.student_id === student.id);
    const total = studentScores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
    const maxTotal = (components || []).reduce((sum, c) => sum + (Number(c.maximum_score) || 0), 0);
    const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

    // Find grade
    const grade = (grading || []).find(g => percentage >= Number(g.minimum_score) && percentage <= Number(g.maximum_score));
    const gradeLetter = grade?.grade || "N/A";

    // Check if already published for edit logging
    const { data: existing } = await supabase.from("term_results").select("*").eq("student_id", student.id).eq("term_id", term_id).eq("subject_id", subject_id).single();

    if (existing?.published) {
      // Log the edit
      await supabase.from("result_edit_logs").insert({
        student_id: student.id, term_id, subject_id, edited_by: userId,
        previous_grade: existing.grade, new_grade: gradeLetter, previous_total: existing.total_score, new_total: total,
      });
    }

    // Upsert term_results
    await supabase.from("term_results").upsert({
      school_id, student_id: student.id, term_id, subject_id,
      total_score: total, grade: gradeLetter, remark: grade?.remark || "",
      published: true, published_by: existing?.published_by || userId,
      published_at: existing?.published_at || new Date().toISOString(),
      last_edited_at: existing?.published ? new Date().toISOString() : null,
    }, { onConflict: "student_id,term_id,subject_id" });
  }

  return NextResponse.json({ success: true, count: students.length });
}
