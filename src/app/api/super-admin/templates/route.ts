import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("report_card_templates")
    .select("*, sections:report_card_template_sections(count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, description, page_size, orientation, colors, sections } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data: template, error } = await supabase
    .from("report_card_templates")
    .insert({
      name, description: description || null,
      page_size: page_size || "A4", orientation: orientation || "portrait",
      colors: colors || { primary: "#2A4B8D", accent: "#F0A63A", text: "#16202E" },
      created_by: userId || null,
    }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(sections) && sections.length > 0) {
    await supabase.from("report_card_template_sections").insert(
      sections.map((s: any, i: number) => ({
        template_id: template.id, section_key: s.section_key,
        label: s.label || s.section_key, display_order: s.display_order ?? i,
        config: s.config || {}, is_enabled: s.is_enabled ?? true,
      }))
    );
  }

  return NextResponse.json(template, { status: 201 });
}
