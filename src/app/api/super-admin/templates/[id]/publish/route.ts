import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = getServiceClient();
  const { data: template } = await supabase
    .from("report_card_templates").select("*").eq("id", id).single();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: sections } = await supabase
    .from("report_card_template_sections").select("*").eq("template_id", id).order("display_order");

  const newVersion = (template.version || 0) + 1;
  const frozenConfig = {
    name: template.name, description: template.description,
    page_size: template.page_size, orientation: template.orientation,
    colors: template.colors, sections: sections || [],
  };

  await supabase.from("report_card_template_versions").insert({
    template_id: id, version: newVersion, frozen_config: frozenConfig,
    published_by: userId || null,
  });

  const { data: updated, error } = await supabase
    .from("report_card_templates")
    .update({ status: "published", version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...updated, version: newVersion });
}
