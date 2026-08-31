import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 2 — term_fees: DEFAULT fees (migrated schema)
// academic_section_id is OPTIONAL: NULL = school-wide default for the term
// (the migrated data uses school-wide defaults with per-class pricing in class_fees).
// fee_type: 'Required' | 'Not Required'

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sectionId = searchParams.get("section_id");

  const supabase = getServiceClient();
  let query = supabase
    .from("term_fees")
    .select("*, fee_heads(id, name, is_compulsory), academic_sections(id, name)")
    .eq("school_id", school_id);

  if (sectionId === "null") query = query.is("academic_section_id", null);
  else if (sectionId) query = query.eq("academic_section_id", sectionId);

  const { data, error } = await query.order("fee_head_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { academic_section_id, fee_head_id, default_amount, fee_type } = body;

  if (!fee_head_id) return NextResponse.json({ error: "fee_head_id is required" }, { status: 400 });
  const amount = Number(default_amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "default_amount must be a non-negative number" }, { status: 400 });
  }
  const ftype = fee_type === "Not Required" ? "Not Required" : "Required";

  const supabase = getServiceClient();

  // One default per (school, section, fee_head) — section may be NULL (school-wide)
  let q = supabase
    .from("term_fees")
    .select("id")
    .eq("school_id", school_id)
    .eq("fee_head_id", fee_head_id);
  q = academic_section_id ? q.eq("academic_section_id", academic_section_id) : q.is("academic_section_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing) return NextResponse.json({ error: "A default fee for this fee head already exists" }, { status: 409 });

  const { data, error } = await supabase
    .from("term_fees")
    .insert({ school_id, academic_section_id: academic_section_id || null, fee_head_id, default_amount: amount, fee_type: ftype, is_active: true })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, default_amount, fee_type, is_active } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (default_amount !== undefined) {
    const amount = Number(default_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "default_amount must be a non-negative number" }, { status: 400 });
    }
    updates.default_amount = amount;
  }
  if (fee_type !== undefined) updates.fee_type = fee_type === "Not Required" ? "Not Required" : "Required";
  if (is_active !== undefined) updates.is_active = !!is_active;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("term_fees")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Soft-disable only — hard-deleting a term_fee would CASCADE-delete class
// overrides (class_fees.term_fee_id FK) and any bill lines referencing it.
export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("term_fees")
    .update({ is_active: false })
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
