import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 2 — fee heads against the MIGRATED schema (is_compulsory / is_active / display_order)

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("fee_heads")
    .select("*")
    .eq("school_id", school_id)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { description, is_compulsory, display_order } = body;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "name must be 100 characters or fewer" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from("fee_heads")
    .select("id")
    .eq("school_id", school_id)
    .eq("name", name)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "A fee head with this name already exists" }, { status: 409 });

  const { data, error } = await supabase
    .from("fee_heads")
    .insert({
      school_id,
      name,
      description: description || null,
      is_compulsory: is_compulsory !== false, // default: compulsory
      is_active: true,
      display_order: Number.isFinite(display_order) ? display_order : 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, description, is_compulsory, is_active, display_order } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();

  // Name conflicts are only checked when the name actually changes
  if (typeof name === "string" && name.trim()) {
    const { data: existing } = await supabase
      .from("fee_heads")
      .select("id")
      .eq("school_id", school_id)
      .eq("name", name.trim())
      .neq("id", id)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "A fee head with this name already exists" }, { status: 409 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (description !== undefined) updates.description = description || null;
  if (is_compulsory !== undefined) updates.is_compulsory = !!is_compulsory;
  if (is_active !== undefined) updates.is_active = !!is_active;
  if (Number.isFinite(display_order)) updates.display_order = display_order;

  const { data, error } = await supabase
    .from("fee_heads")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Soft-delete only — fee_heads may be referenced by term_fees (history must survive)
export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("fee_heads")
    .update({ is_active: false })
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
