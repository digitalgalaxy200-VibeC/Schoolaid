import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 2 — class_fees: CLASS-LEVEL OVERRIDES of section defaults (migrated schema)

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");

  const supabase = getServiceClient();
  let query = supabase
    .from("class_fees")
    .select("*, term_fees(fee_head_id, default_amount, fee_type, fee_heads(id, name)), classes(id, name, section_id)")
    .eq("school_id", school_id);

  if (classId) query = query.eq("class_id", classId);

  const { data, error } = await query.order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { term_fee_id, class_id, amount, is_compulsory } = body;

  if (!term_fee_id) return NextResponse.json({ error: "term_fee_id is required" }, { status: 400 });
  if (!class_id) return NextResponse.json({ error: "class_id is required" }, { status: 400 });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // One override per (term_fee, class)
  const { data: existing } = await supabase
    .from("class_fees")
    .select("id")
    .eq("school_id", school_id)
    .eq("term_fee_id", term_fee_id)
    .eq("class_id", class_id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "An override for this fee and class already exists" }, { status: 409 });

  const { data, error } = await supabase
    .from("class_fees")
    .insert({ school_id, term_fee_id, class_id, amount: amt, is_compulsory: is_compulsory !== false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, amount, is_compulsory } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (amount !== undefined) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }
    updates.amount = amt;
  }
  if (is_compulsory !== undefined) updates.is_compulsory = !!is_compulsory;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("class_fees")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Deleting an override is safe and semantically correct: it removes the
// exception and the class falls back to the section default. (student_fee_adjustments
// rows for that override cascade — they are meaningless without it.)
export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("class_fees")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
