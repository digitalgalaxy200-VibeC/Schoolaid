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

  // A template with no rows is what makes a configured class look "unconfigured"
  // on the marks screen — refuse saves that would leave it empty.
  const validRows = (rows as any[]).filter((r: any) => r && r.name && String(r.name).trim());
  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "Add at least one assessment component (e.g. CA1, Exam) before saving." },
      { status: 400 },
    );
  }

  try {
    let template_id = id;
    if (template_id) {
      // Tenant guard: template must belong to this school before mutating (RLS bypassed via service client)
      const { data: existing } = await supabase
        .from("components_templates")
        .select("id")
        .eq("id", template_id)
        .eq("school_id", school_id)
        .maybeSingle();
      if (!existing)
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      await supabase.from("components_templates").update({ name }).eq("id", template_id).eq("school_id", school_id);
    } else {
      const { data, error } = await supabase.from("components_templates").insert({ school_id, name }).select().single();
      if (error) throw error;
      template_id = data.id;
    }

    // Replace relations (template_id verified/owned by this school above)
    await supabase.from("class_components_templates").delete().eq("school_id", school_id).eq("template_id", template_id);
    await supabase.from("components_rows").delete().eq("template_id", template_id);

    if (class_ids.length > 0) {
      // Tenant guard: classes must belong to this school
      const { data: schoolClasses, error: classQueryErr } = await supabase
        .from("classes")
        .select("id")
        .in("id", class_ids)
        .eq("school_id", school_id);
      if (classQueryErr) throw classQueryErr;
      if (!schoolClasses || schoolClasses.length !== class_ids.length)
        return NextResponse.json({ error: "One or more classes not found in this school" }, { status: 400 });

      await supabase.from("class_components_templates").delete().in("class_id", class_ids).eq("school_id", school_id);
      const { error: clsErr } = await supabase.from("class_components_templates").insert(class_ids.map((c: string) => ({ school_id, class_id: c, template_id })));
      if (clsErr) throw clsErr;
    }

    if (rows.length > 0) {
      const { error: rowErr } = await supabase.from("components_rows").insert(validRows.map((r: any) => ({
        template_id, name: String(r.name).trim(), maximum_score: parseFloat(r.maximum_score || 0), display_order: parseInt(r.display_order || 0)
      })));
      if (rowErr) throw rowErr;
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

  // student_scores.component_id cascades on delete — block deleting a template
  // whose components already carry recorded marks, instead of silently
  // destroying historic scores.
  const { data: templateRows } = await supabase.from("components_rows").select("id").eq("template_id", id);
  const rowIds = (templateRows || []).map((r: { id: string }) => r.id);
  if (rowIds.length > 0) {
    const { count } = await supabase
      .from("student_scores")
      .select("id", { count: "exact", head: true })
      .in("component_id", rowIds);
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `This template's components have ${count} recorded score(s). Deleting it would erase them — clear or reassign the scores first.` },
        { status: 409 },
      );
    }
  }

  const { error } = await supabase.from("components_templates").delete().eq("id", id).eq("school_id", school_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
