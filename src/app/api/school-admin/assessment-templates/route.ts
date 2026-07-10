import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("assessment_templates")
    .select(
      `
      id, name, created_at,
      class_assessment_templates ( class_id ),
      template_components ( name, maximum_score, display_order ),
      template_grading_scales ( grade, minimum_score, maximum_score, remark ),
      template_psychomotor_traits ( name, display_order ),
      template_affective_traits ( name, display_order )
      `
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json();
  const {
    id, // optional (update mode)
    name,
    class_ids = [],
    components = [],
    grading = [],
    psychomotor = [],
    affective = [],
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }

  try {
    let template_id = id;

    // 1. Insert or Update Template
    if (template_id) {
      const { error: updErr } = await supabase
        .from("assessment_templates")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", template_id)
        .eq("school_id", school_id);
      if (updErr) throw updErr;
    } else {
      const { data, error: insErr } = await supabase
        .from("assessment_templates")
        .insert({ school_id, name })
        .select()
        .single();
      if (insErr) throw insErr;
      template_id = data.id;
    }

    // 2. Clear old relationships (safest way to sync)
    await Promise.all([
      supabase.from("class_assessment_templates").delete().eq("template_id", template_id),
      supabase.from("template_components").delete().eq("template_id", template_id),
      supabase.from("template_grading_scales").delete().eq("template_id", template_id),
      supabase.from("template_psychomotor_traits").delete().eq("template_id", template_id),
      supabase.from("template_affective_traits").delete().eq("template_id", template_id),
    ]);

    // 3. Insert new relationships
    if (class_ids.length > 0) {
      // First, remove these classes from ANY other template (1 class = 1 template)
      await supabase.from("class_assessment_templates").delete().in("class_id", class_ids).eq("school_id", school_id);
      
      const classRows = class_ids.map((cid: string) => ({
        school_id,
        class_id: cid,
        template_id,
      }));
      await supabase.from("class_assessment_templates").insert(classRows);
    }

    if (components.length > 0) {
      const compRows = components.map((c: any) => ({
        template_id,
        name: c.name,
        maximum_score: parseFloat(c.maximum_score || 0),
        display_order: parseInt(c.display_order || 0),
      }));
      await supabase.from("template_components").insert(compRows);
    }

    if (grading.length > 0) {
      const gradRows = grading.map((g: any) => ({
        template_id,
        grade: g.grade,
        minimum_score: parseFloat(g.minimum_score || 0),
        maximum_score: parseFloat(g.maximum_score || 0),
        remark: g.remark || null,
      }));
      await supabase.from("template_grading_scales").insert(gradRows);
    }

    if (psychomotor.length > 0) {
      const psyRows = psychomotor.map((p: any) => ({
        template_id,
        name: p.name,
        display_order: parseInt(p.display_order || 0),
      }));
      await supabase.from("template_psychomotor_traits").insert(psyRows);
    }

    if (affective.length > 0) {
      const affRows = affective.map((a: any) => ({
        template_id,
        name: a.name,
        display_order: parseInt(a.display_order || 0),
      }));
      await supabase.from("template_affective_traits").insert(affRows);
    }

    return NextResponse.json({ success: true, id: template_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("assessment_templates")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
