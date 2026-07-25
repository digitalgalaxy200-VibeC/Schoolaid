import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = getServiceClient();
  const { data: source } = await supabase
    .from("report_card_templates").select("*").eq("id", id).single();
  if (!source) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: sections } = await supabase
    .from("report_card_template_sections").select("*").eq("template_id", id).order("display_order");

  const { data: clone, error } = await supabase
    .from("report_card_templates").insert({
      name: `${source.name} (Copy)`, description: source.description,
      page_size: source.page_size, orientation: source.orientation,
      colors: source.colors, status: "draft", version: 1, created_by: userId || null,
    }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sections && sections.length > 0) {
    await supabase.from("report_card_template_sections").insert(
      sections.map((s: any) => ({
        template_id: clone.id, section_key: s.section_key, label: s.label,
        display_order: s.display_order, config: s.config, is_enabled: s.is_enabled,
      }))
    );
  }

  return NextResponse.json(clone, { status: 201 });
}
