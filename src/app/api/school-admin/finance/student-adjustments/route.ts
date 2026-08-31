import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 4 — student-specific fee adjustments (opt-in / opt-out of optional fees)
// Uses the migrated student_fee_adjustments table (class_fee_id + is_opted_in).
// NOTE: the table has no unique constraint — dedup happens in code (one row
// per student + class_fee).

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id");

  const supabase = getServiceClient();
  let query = supabase
    .from("student_fee_adjustments")
    .select("*, class_fees(amount, term_fees(fee_head_id, fee_type, fee_heads(name)))")
    .eq("school_id", school_id);

  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { student_id, class_fee_id, is_opted_in } = body;
  if (!student_id) return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  if (!class_fee_id) return NextResponse.json({ error: "class_fee_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  // ── Tenant isolation: both references must belong to THIS school ──
  const [{ data: student }, { data: classFee }] = await Promise.all([
    supabase.from("students").select("id").eq("id", student_id).eq("school_id", school_id).maybeSingle(),
    supabase.from("class_fees").select("id, term_fee_id").eq("id", class_fee_id).eq("school_id", school_id).maybeSingle(),
  ]);
  if (!student) return NextResponse.json({ error: "student_id does not belong to this school" }, { status: 400 });
  if (!classFee) return NextResponse.json({ error: "class_fee_id does not belong to this school" }, { status: 400 });

  // The class fee must belong to the student's own class
  const { data: stuRow } = await supabase
    .from("students")
    .select("class_id")
    .eq("id", student_id)
    .single();
  const { data: cfRow } = await supabase
    .from("class_fees")
    .select("class_id")
    .eq("id", class_fee_id)
    .single();
  if (cfRow && stuRow && cfRow.class_id !== stuRow.class_id) {
    return NextResponse.json({ error: "class_fee_id does not belong to this student's class" }, { status: 400 });
  }

  // Upsert (dedup in code — no DB unique constraint)
  const { data: existing } = await supabase
    .from("student_fee_adjustments")
    .select("id")
    .eq("school_id", school_id)
    .eq("student_id", student_id)
    .eq("class_fee_id", class_fee_id)
    .maybeSingle();

  let result;
  let error;
  if (existing) {
    const res = await supabase
      .from("student_fee_adjustments")
      .update({ is_opted_in: !!is_opted_in })
      .eq("id", existing.id)
      .eq("school_id", school_id)
      .select()
      .single();
    result = res.data;
    error = res.error;
  } else {
    const res = await supabase
      .from("student_fee_adjustments")
      .insert({ school_id, student_id, class_fee_id, is_opted_in: !!is_opted_in })
      .select()
      .single();
    result = res.data;
    error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(result, { status: existing ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("student_fee_adjustments")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
