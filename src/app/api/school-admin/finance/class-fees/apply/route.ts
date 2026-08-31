import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Phase 2 — "Apply to Classes": materialize the default fee into class_fees
// for every class (optionally scoped to a section), WITHOUT overwriting
// existing class-specific overrides unless ?replace=true is explicitly given.
//
// dry_run=true returns the plan without writing anything (safe preview).

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { term_fee_id, section_id, replace, dry_run } = body;
  if (!term_fee_id) return NextResponse.json({ error: "term_fee_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  // ── Tenant isolation: the default must belong to THIS school ──
  const { data: termFee, error: tfErr } = await supabase
    .from("term_fees")
    .select("id, default_amount, fee_type")
    .eq("id", term_fee_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (tfErr) return NextResponse.json({ error: tfErr.message }, { status: 500 });
  if (!termFee) return NextResponse.json({ error: "term_fee_id does not belong to this school" }, { status: 400 });

  // Target classes: by section if given (and section belongs to school), else all active classes
  let classesQuery = supabase
    .from("classes")
    .select("id, name, section_id")
    .eq("school_id", school_id)
    .neq("is_active", false);

  if (section_id) {
    const { data: section } = await supabase
      .from("academic_sections")
      .select("id")
      .eq("id", section_id)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!section) return NextResponse.json({ error: "section_id does not belong to this school" }, { status: 400 });
    classesQuery = classesQuery.eq("section_id", section_id);
  }

  const { data: classes, error: clsErr } = await classesQuery.order("name");
  if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });
  if (!classes || classes.length === 0) {
    return NextResponse.json({ error: section_id ? "No classes in this section" : "No classes found" }, { status: 404 });
  }

  // Existing overrides for this default
  const { data: existingOverrides } = await supabase
    .from("class_fees")
    .select("id, class_id, amount")
    .eq("school_id", school_id)
    .eq("term_fee_id", term_fee_id);

  const overrideMap = new Map<string, { id: string; amount: number }>();
  for (const o of (existingOverrides || []) as { id: string; class_id: string; amount: number }[]) {
    overrideMap.set(o.class_id, o);
  }

  const toCreate: { class_id: string; class_name: string }[] = [];
  const toUpdate: { class_id: string; class_name: string; class_fee_id: string; from: number; to: number }[] = [];
  const skipped: { class_id: string; class_name: string; reason: string }[] = [];

  const isCompulsory = termFee.fee_type !== "Not Required";
  const targetAmount = Number(termFee.default_amount);

  for (const c of (classes || []) as { id: string; name: string }[]) {
    const existing = overrideMap.get(c.id);
    if (existing) {
      if (replace) {
        toUpdate.push({ class_id: c.id, class_name: c.name, class_fee_id: existing.id, from: Number(existing.amount), to: targetAmount });
      } else {
        skipped.push({ class_id: c.id, class_name: c.name, reason: "existing override kept" });
      }
    } else {
      toCreate.push({ class_id: c.id, class_name: c.name });
    }
  }

  if (dry_run) {
    return NextResponse.json({
      dry_run: true,
      default_amount: targetAmount,
      is_compulsory: isCompulsory,
      to_create: toCreate,
      to_update: toUpdate,
      skipped,
    });
  }

  const created: string[] = [];
  if (toCreate.length > 0) {
    const rows = toCreate.map((c) => ({
      school_id,
      term_fee_id,
      class_id: c.class_id,
      amount: targetAmount,
      is_compulsory: isCompulsory,
    }));
    const { data: inserted, error: insErr } = await supabase.from("class_fees").insert(rows).select("id");
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    created.push(...(inserted || []).map((r) => r.id));
  }

  const updated: string[] = [];
  for (const u of toUpdate) {
    const { data, error } = await supabase
      .from("class_fees")
      .update({ amount: targetAmount, is_compulsory: isCompulsory })
      .eq("id", u.class_fee_id)
      .eq("school_id", school_id)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) updated.push(data.id);
  }

  return NextResponse.json({
    dry_run: false,
    default_amount: targetAmount,
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    skipped_details: skipped,
  });
}
