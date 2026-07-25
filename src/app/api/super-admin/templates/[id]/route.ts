import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = getServiceClient();
  const { data: template, error } = await supabase
    .from("report_card_templates").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: sections } = await supabase
    .from("report_card_template_sections").select("*").eq("template_id", id).order("display_order");

  const { data: versions } = await supabase
    .from("report_card_template_versions")
    .select("id, version, published_at, published_by")
    .eq("template_id", id).order("version", { ascending: false });

  return NextResponse.json({ ...template, sections: sections || [], versions: versions || [] });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const supabase = getServiceClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.page_size !== undefined) updateData.page_size = body.page_size;
  if (body.orientation !== undefined) updateData.orientation = body.orientation;
  if (body.colors !== undefined) updateData.colors = body.colors;
  if (body.status !== undefined) updateData.status = body.status;

  const { data: template, error } = await supabase
    .from("report_card_templates").update(updateData).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(body.sections)) {
    await supabase.from("report_card_template_sections").delete().eq("template_id", id);
    if (body.sections.length > 0) {
      await supabase.from("report_card_template_sections").insert(
        body.sections.map((s: any, i: number) => ({
          template_id: id, section_key: s.section_key,
          label: s.label || s.section_key, display_order: s.display_order ?? i,
          config: s.config || {}, is_enabled: s.is_enabled ?? true,
        }))
      );
    }
  }

  return NextResponse.json(template);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = getServiceClient();
  await supabase.from("report_card_templates")
    .update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ success: true });
}
