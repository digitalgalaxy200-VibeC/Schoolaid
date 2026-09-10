import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 4 — student-specific fee adjustments (opt-in / opt-out of optional fees)
// Uses the migrated student_fee_adjustments table. An opt-in keys to the
// class override row (class_fee_id) when the fee has one, otherwise to the
// term fee row itself (term_fee_id). Partial unique indexes dedupe.

const studentSectionIdOf = async (supabase: ReturnType<typeof getServiceClient>, school_id: string, studentId: string): Promise<string | null> => {
  const { data } = await supabase
    .from("students")
    .select("class_id, classes(section_id)")
    .eq("id", studentId)
    .eq("school_id", school_id)
    .maybeSingle();
  const raw = data?.classes as { section_id: string | null } | { section_id: string | null }[] | null;
  const cls = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  return cls?.section_id ?? null;
};

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id");

  const supabase = getServiceClient();
  let query = supabase
    .from("student_fee_adjustments")
    .select("*, class_fees(amount, term_fees(fee_head_id, fee_type, fee_heads(name))), term_fees(fee_head_id, fee_type, default_amount, fee_heads(name))")
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
  const { student_id, class_fee_id, term_fee_id, is_opted_in } = body;
  if (!student_id) return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  if (!class_fee_id && !term_fee_id) {
    return NextResponse.json({ error: "class_fee_id or term_fee_id is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // ── Tenant isolation + eligibility ──
  const { data: student } = await supabase.from("students").select("id").eq("id", student_id).eq("school_id", school_id).maybeSingle();
  if (!student) return NextResponse.json({ error: "student_id does not belong to this school" }, { status: 400 });

  let classFeeRow: { id: string; class_id: string } | null = null;
  let termFeeRow: { id: string; fee_type: string | null; academic_section_id: string | null; is_active: boolean | null } | null = null;

  if (class_fee_id) {
    const { data: cf } = await supabase
      .from("class_fees")
      .select("id, term_fee_id, class_id")
      .eq("id", class_fee_id)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!cf) return NextResponse.json({ error: "class_fee_id does not belong to this school" }, { status: 400 });
    // The class fee must belong to the student's own class
    const { data: stuRow } = await supabase.from("students").select("class_id").eq("id", student_id).eq("school_id", school_id).single();
    if (stuRow && cf.class_id !== stuRow.class_id) {
      return NextResponse.json({ error: "class_fee_id does not belong to this student's class" }, { status: 400 });
    }
    const { data: tf } = await supabase
      .from("term_fees")
      .select("id, fee_type, academic_section_id, is_active")
      .eq("id", cf.term_fee_id)
      .eq("school_id", school_id)
      .maybeSingle();
    termFeeRow = tf;
    classFeeRow = { id: cf.id, class_id: cf.class_id };
  } else if (term_fee_id) {
    const { data: tf } = await supabase
      .from("term_fees")
      .select("id, fee_type, academic_section_id, is_active")
      .eq("id", term_fee_id)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!tf) return NextResponse.json({ error: "term_fee_id does not belong to this school" }, { status: 400 });
    termFeeRow = tf;
  }

  // Only optional (Not Required) term fees can be opted into per student.
  // A legacy class fee without a term-fee row keeps the historical allowance.
  if (termFeeRow && (termFeeRow.fee_type ?? "Required") === "Required") {
    return NextResponse.json({ error: "Only optional fees can be opted into per student" }, { status: 400 });
  }
  // Section-scoped rows only apply when the student's class is in that section.
  if (termFeeRow?.academic_section_id) {
    const sectionId = await studentSectionIdOf(supabase, school_id, student_id);
    if (termFeeRow.academic_section_id !== sectionId) {
      return NextResponse.json({ error: "This fee is not available to the student's section" }, { status: 400 });
    }
  }

  // Upsert (dedupe via partial unique indexes; still check in code for clean errors)
  const q = supabase
    .from("student_fee_adjustments")
    .select("id")
    .eq("school_id", school_id)
    .eq("student_id", student_id);
  const { data: existing } = classFeeRow
    ? await q.eq("class_fee_id", classFeeRow.id).maybeSingle()
    : term_fee_id
      ? await q.eq("term_fee_id", term_fee_id).maybeSingle()
      : { data: null };

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
    const insertBody = {
      school_id,
      student_id,
      is_opted_in: !!is_opted_in,
      class_fee_id: classFeeRow ? classFeeRow.id : null,
      term_fee_id: classFeeRow ? null : term_fee_id ?? null,
    };
    const res = await supabase.from("student_fee_adjustments").insert(insertBody).select().single();
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
