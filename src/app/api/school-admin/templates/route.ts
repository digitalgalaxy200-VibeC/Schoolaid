import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

/** GET /api/school-admin/templates — get published templates + school assignments */
export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template_id");

  // If template_id provided, return that template's sections + school configs
  if (templateId) {
    const [{ data: template }, { data: sections }, { data: configs }] = await Promise.all([
      supabase.from("report_card_templates").select("id, name, version").eq("id", templateId).single(),
      supabase.from("report_card_template_sections").select("*").eq("template_id", templateId).order("display_order"),
      supabase.from("school_template_configs").select("*").eq("school_id", school_id).eq("template_id", templateId),
    ]);
    return NextResponse.json({ template, sections: sections || [], configs: configs || [] });
  }

  // Otherwise return full list
  const [{ data: templates }, { data: assignments }, { data: configs }, { data: classGrades }] = await Promise.all([
    supabase.from("report_card_templates").select("id, name, description, version, status").eq("status", "published").order("name"),
    supabase.from("school_template_assignments").select("id, grade_level, template_id").eq("school_id", school_id),
    supabase.from("school_template_configs").select("template_id, section_key, is_enabled, custom_label").eq("school_id", school_id),
    supabase.from("classes").select("grade_level").eq("school_id", school_id).order("grade_level"),
  ]);

  const gradeLevels = [...new Set((classGrades || []).map((c: any) => c.grade_level).filter(Boolean))];

  return NextResponse.json({
    templates: templates || [],
    assignments: assignments || [],
    configs: configs || [],
    gradeLevels,
  });
}

/** POST /api/school-admin/templates — assign template to a grade level */
export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_id, grade_level } = await request.json();
  if (!template_id || !grade_level) {
    return NextResponse.json({ error: "template_id and grade_level are required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("school_template_assignments")
    .upsert({ school_id, template_id, grade_level }, { onConflict: "school_id,grade_level" })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** PUT /api/school-admin/templates — update section configs for a template */
export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { template_id, configs } = await request.json();
  if (!template_id) return NextResponse.json({ error: "template_id is required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("school_template_configs").delete().eq("school_id", school_id).eq("template_id", template_id);

  if (Array.isArray(configs) && configs.length > 0) {
    const rows = configs.map((c: any) => ({
      school_id, template_id, section_key: c.section_key,
      is_enabled: c.is_enabled ?? true, custom_label: c.custom_label || null,
    }));
    const { error } = await supabase.from("school_template_configs").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
