import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// GET scores for a class+subject+term
export async function GET(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const classId = searchParams.get("class_id");
  if (!termId || !classId) return NextResponse.json({ error: "term_id and class_id required" }, { status: 400 });
  const supabase = getServiceClient();
  // Get students in this class
  const { data: students } = await supabase.from("students").select("id, profiles(full_name)").eq("school_id", school_id).eq("class_id", classId);
  // Get assessment components + scores for this term
  const { data: components } = await supabase.from("assessment_components").select("*").eq("school_id", school_id).order("display_order");
  const { data: scores } = await supabase.from("student_scores").select("*").eq("school_id", school_id).eq("term_id", termId);
  // Get attendance, psychomotor, affective
  const [{ data: attendance }, { data: psycho }, { data: affective }, { data: psychoDefs }, { data: affectiveDefs }, { data: comments }] = await Promise.all([
    supabase.from("attendance_records").select("*").eq("school_id", school_id).eq("term_id", termId),
    supabase.from("psychomotor_scores").select("*").eq("school_id", school_id).eq("term_id", termId),
    supabase.from("affective_scores").select("*").eq("school_id", school_id).eq("term_id", termId),
    supabase.from("psychomotor_definitions").select("*").eq("school_id", school_id).order("display_order"),
    supabase.from("affective_definitions").select("*").eq("school_id", school_id).order("display_order"),
    supabase.from("teacher_comments").select("*").eq("school_id", school_id).eq("term_id", termId),
  ]);
  return NextResponse.json({ students: students || [], components: components || [], scores: scores || [], attendance: attendance || [], psychoDefs: psychoDefs || [], psycho: psycho || [], affectiveDefs: affectiveDefs || [], affective: affective || [], comments: comments || [] });
}

// POST scores/attendance/psychomotor/affective/comments
export async function POST(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { type, data } = body; // type: "score"|"attendance"|"psychomotor"|"affective"|"comment"
  const supabase = getServiceClient();

  if (type === "score") {
    const { student_id, assessment_component_id, term_id, score } = data;
    const { error } = await supabase.from("student_scores").upsert({ school_id, student_id, assessment_component_id, term_id, score }, { onConflict: "student_id,assessment_component_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "attendance") {
    const { student_id, term_id, days_school_opened, days_present, days_absent } = data;
    const { error } = await supabase.from("attendance_records").upsert({ school_id, student_id, term_id, days_school_opened, days_present, days_absent }, { onConflict: "student_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "psychomotor") {
    const { student_id, trait_id, term_id, score } = data;
    const { error } = await supabase.from("psychomotor_scores").upsert({ school_id, student_id, trait_id, term_id, score }, { onConflict: "student_id,trait_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "affective") {
    const { student_id, trait_id, term_id, score } = data;
    const { error } = await supabase.from("affective_scores").upsert({ school_id, student_id, trait_id, term_id, score }, { onConflict: "student_id,trait_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "comment") {
    const { student_id, term_id, comment } = data;
    const { error } = await supabase.from("teacher_comments").upsert({ school_id, student_id, term_id, comment }, { onConflict: "student_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
