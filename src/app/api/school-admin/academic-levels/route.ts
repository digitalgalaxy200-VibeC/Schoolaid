import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data: levels, error } = await supabase
    .from("academic_levels")
    .select("*, classes:classes(id, name, class_components_templates(template_id), class_grading_templates(template_id), class_psychomotor_templates(template_id), class_affective_templates(template_id)), level_components_templates(template_id), level_grading_templates(template_id), level_psychomotor_templates(template_id), level_affective_templates(template_id)")
    .eq("school_id", school_id)
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch school-default templates
  const { data: schoolTemplates } = await supabase
    .from("schools")
    .select("school_components_templates(template_id), school_grading_templates(template_id), school_psychomotor_templates(template_id), school_affective_templates(template_id)")
    .eq("id", school_id)
    .single();

  const enriched = (levels || []).map(level => {
    const hasClassCoverage = (level.classes || []).some((c: any) => {
      const has = (k: string) => (c[`class_${k}_templates`] || []).length > 0;
      return has("components") || has("grading") || has("psychomotor") || has("affective");
    });
    const health = ["components", "grading", "psychomotor", "affective"].map(k => {
      const levelHas = (level as any)[`level_${k}_templates`]?.length > 0;
      // Check class-level templates on ANY class in this level
      const classHas = (level.classes || []).some((c: any) => (c[`class_${k}_templates`] || []).length > 0);
      // Check school-default
      const schoolHas = (schoolTemplates as any)?.[`school_${k}_templates`]?.length > 0;
      return { key: k, has: levelHas || classHas || schoolHas };
    });
    return { ...level, health, ready: health.every(h => h.has) };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, display_order, class_ids = [], templates = {} } = await request.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const supabase = getServiceClient();

  let level_id = id;
  if (level_id) {
    await supabase.from("academic_levels").update({ name, display_order }).eq("id", level_id).eq("school_id", school_id);
  } else {
    const { data, error } = await supabase.from("academic_levels").insert({ school_id, name, display_order }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    level_id = data.id;
  }

  // Always reset class assignments for this level first, then re-assign
  await supabase.from("classes").update({ academic_level_id: null }).eq("academic_level_id", level_id).eq("school_id", school_id);
  if (class_ids.length > 0) {
    const { error: clsErr } = await supabase.from("classes").update({ academic_level_id: level_id }).in("id", class_ids).eq("school_id", school_id);
    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });
  }

  // Always upsert/delete template assignments (handles clearing a template back to "None")
  const templateTables: Record<string, string> = {
    components: "level_components_templates",
    grading: "level_grading_templates",
    psychomotor: "level_psychomotor_templates",
    affective: "level_affective_templates",
  };

  const templateErrors: string[] = [];
  for (const [key, table] of Object.entries(templateTables)) {
    const templateId = (templates as any)[key];
    // Always delete the existing assignment first
    await supabase.from(table).delete().eq("level_id", level_id);
    // Only re-insert if a template was actually chosen
    if (templateId) {
      const { error } = await supabase.from(table).insert({ school_id, level_id, template_id: templateId });
      if (error) {
        console.error(`${key} template assign error:`, error.message);
        templateErrors.push(`${key}: ${error.message}`);
      }
    }
  }

  if (templateErrors.length > 0) {
    return NextResponse.json({ error: `Template assignment failed: ${templateErrors.join("; ")}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: level_id });
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("classes").update({ academic_level_id: null }).eq("academic_level_id", id).eq("school_id", school_id);
  await supabase.from("academic_levels").delete().eq("id", id).eq("school_id", school_id);

  return NextResponse.json({ success: true });
}
