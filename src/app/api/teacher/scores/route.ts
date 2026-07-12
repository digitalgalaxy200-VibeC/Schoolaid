import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const classId = searchParams.get("class_id");
  const subjectId = searchParams.get("subject_id");
  if (!termId || !classId) return NextResponse.json({ error: "term_id and class_id required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: students } = await supabase.from("students").select("id, profiles(full_name)").eq("school_id", school_id).eq("class_id", classId);

  // Resolve assessment template for this class
  let components: any[] | null = null;
  const { data: classTemplate } = await supabase.from("class_components_templates").select("template_id").eq("school_id", school_id).eq("class_id", classId).maybeSingle();
  if (classTemplate?.template_id) {
    const { data: rows } = await supabase.from("components_rows").select("*").eq("template_id", classTemplate.template_id).order("display_order");
    components = rows;
  }
  if (!components || components.length === 0) {
    const { data: old } = await supabase.from("assessment_components").select("*").eq("school_id", school_id).order("display_order");
    components = old;
  }

  // Get scores — filter by subject_id if provided
  let scoresQuery = supabase.from("student_scores").select("*").eq("school_id", school_id).eq("term_id", termId);
  if (subjectId) scoresQuery = scoresQuery.eq("subject_id", subjectId);
  const { data: scores } = await scoresQuery;

  const normalizedScores = (scores || []).map((s: any) => ({
    ...s,
    assessment_component_id: s.component_id || s.assessment_component_id,
  }));

  const normalizedComponents = (components || []).map((c: any) => ({
    id: c.id, name: c.name, maximum_score: c.maximum_score, display_order: c.display_order,
  }));

  return NextResponse.json({ students: students || [], components: normalizedComponents, scores: normalizedScores });
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { type, data } = body;
  const supabase = getServiceClient();

  if (type === "score") {
    const { student_id, assessment_component_id, term_id, score, subject_id } = data;
    const componentId = assessment_component_id;

    const insert: Record<string, unknown> = { school_id, student_id, term_id, score: score || 0 };
    if (subject_id) insert.subject_id = subject_id;

    // Try new schema (component_id + subject_id)
    const { error: e1 } = await supabase.from("student_scores").upsert(
      { ...insert, component_id: componentId },
      { onConflict: "student_id,component_id,term_id" }
    );
    if (!e1) return NextResponse.json({ success: true });

    // Fallback: old column name
    const { error: e2 } = await supabase.from("student_scores").upsert(
      { ...insert, assessment_component_id: componentId },
      { onConflict: "student_id,assessment_component_id,term_id" }
    );
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ success: true });

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
