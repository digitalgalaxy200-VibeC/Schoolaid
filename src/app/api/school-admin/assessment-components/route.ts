import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("components_templates")
    .select("id, name, created_at, class_components_templates(class_id), components_rows(name, maximum_score, display_order)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { id, name, class_ids = [], rows = [] } = await request.json();

  if (!name) return NextResponse.json({ error: "Template name required" }, { status: 400 });

  try {
    let template_id = id;
    if (template_id) {
      await supabase.from("components_templates").update({ name }).eq("id", template_id);
    } else {
      const { data } = await supabase.from("components_templates").insert({ school_id, name }).select().single();
      template_id = data.id;
    }

    // Replace relations
    await supabase.from("class_components_templates").delete().eq("template_id", template_id);
    await supabase.from("components_rows").delete().eq("template_id", template_id);

    if (class_ids.length > 0) {
      await supabase.from("class_components_templates").delete().in("class_id", class_ids).eq("school_id", school_id);
      await supabase.from("class_components_templates").insert(class_ids.map((c: string) => ({ school_id, class_id: c, template_id })));
    }

    if (rows.length > 0) {
      await supabase.from("components_rows").insert(rows.map((r: any) => ({
        template_id, name: r.name, maximum_score: parseFloat(r.maximum_score || 0), display_order: parseInt(r.display_order || 0)
      })));
    }

    return NextResponse.json({ success: true, id: template_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("components_templates").delete().eq("id", id).eq("school_id", school_id);
  return NextResponse.json({ success: true });
}
