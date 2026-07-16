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
  // Step 1: Look for a template directly linked to this class
  let components: any[] | null = null;
  const { data: classTemplate } = await supabase
    .from("class_components_templates")
    .select("template_id")
    .eq("class_id", classId)
    .maybeSingle();

  if (classTemplate?.template_id) {
    const { data: rows } = await supabase
      .from("components_rows")
      .select("*")
      .eq("template_id", classTemplate.template_id)
      .order("display_order");
    components = rows;
  }

  // Step 2: If no class-specific template found, use the school's first/only template
  if (!components || components.length === 0) {
    const { data: schoolTemplate } = await supabase
      .from("components_templates")
      .select("id")
      .eq("school_id", school_id)
      .limit(1)
      .maybeSingle();
    if (schoolTemplate?.id) {
      const { data: rows } = await supabase
        .from("components_rows")
        .select("*")
        .eq("template_id", schoolTemplate.id)
        .order("display_order");
      components = rows;
    }
  }

  // Get scores — filtered by the students in this class
  // We use student IDs (from the already-fetched students array) as a reliable
  // filter. This works with or without the class_id migration column.
  const studentIds = (students || []).map((s: any) => s.id);
  let scores: any[] = [];
  if (studentIds.length > 0) {
    let scoresQuery = supabase
      .from("student_scores")
      .select("*")
      .eq("school_id", school_id)
      .eq("term_id", termId)
      .in("student_id", studentIds);
    if (subjectId) scoresQuery = scoresQuery.eq("subject_id", subjectId);
    const { data: scoreData, error: scoreError } = await scoresQuery;
    if (scoreError) console.error("Score fetch error:", scoreError.message);
    scores = scoreData || [];
  }

  const normalizedScores = scores.map((s: any) => ({
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
    const { student_id, assessment_component_id, term_id, score, subject_id, class_id } = data;
    const componentId = assessment_component_id;

    if (!componentId || !student_id || !term_id) {
      return NextResponse.json({ error: "student_id, assessment_component_id, and term_id are required" }, { status: 400 });
    }

    // Check if a score already exists for this student + component + term
    const { data: existing } = await supabase
      .from("student_scores")
      .select("id")
      .eq("student_id", student_id)
      .eq("component_id", componentId)
      .eq("term_id", term_id)
      .maybeSingle();

    const updates: Record<string, unknown> = { score: score ?? 0 };
    if (subject_id) updates.subject_id = subject_id;
    if (class_id)   updates.class_id   = class_id;

    if (existing?.id) {
      // UPDATE the existing row
      const { error } = await supabase
        .from("student_scores")
        .update(updates)
        .eq("id", existing.id);
      if (error) {
        console.error("Score update error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // INSERT a new row
      const { error } = await supabase
        .from("student_scores")
        .insert({ school_id, student_id, component_id: componentId, term_id, ...updates });
      if (error) {
        console.error("Score insert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
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
