import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Fee Matrix — one screen to price every fee head for every class.
//
// Model (reuses the migrated tables, nothing new):
//   fee_heads ............................ the fee types a school offers
//   term_fees (term = NULL) ............... "All classes" default (+ optional section defaults)
//   class_fees ........................... per-class amount (override)
//
// A cell is EMPTY when the class is not charged that fee. Empty is stored as a
// ₦0 class_fees override when a default exists (billing skips ₦0 lines), or as
// no row at all when there is no default.
//
//   GET  /finance/matrix
//   POST /finance/matrix  { action, ... }:
//     set_default     { fee_head_id, amount }      — all-classes default
//     set_classes     { fee_head_id, class_ids[], amount }
//     clear_classes   { fee_head_id, class_ids[] } — mark "not needed"
//     set_compulsory  { fee_head_id, is_compulsory }

type HeadRow = { id: string; name: string; is_compulsory: boolean; is_active: boolean };
type ClassRow = { id: string; name: string; section_id: string | null };
type TermFeeRow = { id: string; fee_head_id: string; default_amount: number; academic_section_id: string | null; fee_type: string; term_id: string | null };
type ClassFeeRow = { id: string; term_fee_id: string; class_id: string; amount: number; is_compulsory: boolean | null };

const feeTypeOf = (isCompulsory: boolean) => (isCompulsory ? "Required" : "Not Required");
const amt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const [{ data: heads }, { data: classes }, { data: sections }, { data: termFees }, { data: classFees }] =
    await Promise.all([
      supabase.from("fee_heads").select("id, name, is_compulsory, is_active").eq("school_id", school_id).order("name"),
      supabase.from("classes").select("id, name, section_id").eq("school_id", school_id).order("name"),
      supabase.from("academic_sections").select("id, name").eq("school_id", school_id).order("name"),
      supabase.from("term_fees").select("id, fee_head_id, default_amount, academic_section_id, fee_type").eq("school_id", school_id),
      supabase.from("class_fees").select("id, term_fee_id, class_id, amount, is_compulsory").eq("school_id", school_id),
    ]);

  const headRows = (heads || []) as HeadRow[];
  const classRows = (classes || []) as ClassRow[];
  const sectionRows = (sections || []) as { id: string; name: string }[];
  // Only the "standing" configuration participates in the matrix: rows that are
  // not term-scoped. Section-scoped rows apply to classes in that section.
  const tfRows = ((termFees || []) as TermFeeRow[]).filter((t) => !t.term_id);
  const cfRows = (classFees || []) as ClassFeeRow[];

  // Defaults keyed for quick lookups
  const tfByHead = new Map<string, TermFeeRow>(); // school-wide default per head
  const sectionTfByHead = new Map<string, TermFeeRow>(); // "head::section"
  for (const t of tfRows) {
    if (t.academic_section_id === null) {
      if (!tfByHead.has(t.fee_head_id)) tfByHead.set(t.fee_head_id, t);
    } else {
      const k = `${t.fee_head_id}::${t.academic_section_id}`;
      if (!sectionTfByHead.has(k)) sectionTfByHead.set(k, t);
    }
  }

  // class overrides → "head::class"
  const cfByHeadClass = new Map<string, { id: string; amount: number }>();
  const tfHeadOf = new Map<string, string>(); // term_fee_id → fee_head_id
  for (const t of tfRows) tfHeadOf.set(t.id, t.fee_head_id);
  for (const c of cfRows) {
    const fh = tfHeadOf.get(c.term_fee_id);
    if (fh) cfByHeadClass.set(`${fh}::${c.class_id}`, { id: c.id, amount: Number(c.amount) });
  }

  const defaults = headRows.map((h) => {
    const sw = tfByHead.get(h.id);
    return {
      ...h,
      default: sw && Number(sw.default_amount) > 0 ? { term_fee_id: sw.id, amount: Number(sw.default_amount) } : null,
    };
  });

  // Effective amount per (head, class): override → section default → school-wide default → empty
  const cells: { fee_head_id: string; class_id: string; amount: number | null; excluded: boolean }[] = [];
  for (const h of headRows) {
    const sw = tfByHead.get(h.id);
    for (const c of classRows) {
      const override = cfByHeadClass.get(`${h.id}::${c.id}`);
      let effective: number | null = null;
      let excluded = false;
      if (override) {
        if (Number(override.amount) > 0) effective = Number(override.amount);
        else excluded = true;
      } else {
        const secDef = c.section_id ? sectionTfByHead.get(`${h.id}::${c.section_id}`) : null;
        const src = secDef || sw;
        if (src && Number(src.default_amount) > 0) effective = Number(src.default_amount);
      }
      cells.push({ fee_head_id: h.id, class_id: c.id, amount: effective, excluded });
    }
  }

  return NextResponse.json({ fee_heads: defaults, classes: classRows, sections: sectionRows, cells });
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, fee_head_id } = body;
  if (!action || !fee_head_id) return NextResponse.json({ error: "action and fee_head_id are required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: head } = await supabase
    .from("fee_heads")
    .select("id, name, is_compulsory")
    .eq("id", fee_head_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!head) return NextResponse.json({ error: "fee_head_id does not belong to this school" }, { status: 400 });

  // ── ensure the school-wide term_fees row exists (parent for class overrides) ──
  const ensureParent = async () => {
    const { data: existing } = await supabase
      .from("term_fees")
      .select("id")
      .eq("school_id", school_id)
      .eq("fee_head_id", fee_head_id)
      .is("academic_section_id", null)
      .is("term_id", null)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: created, error } = await supabase
      .from("term_fees")
      .insert({
        school_id,
        fee_head_id,
        academic_section_id: null,
        term_id: null,
        default_amount: 0,
        fee_type: feeTypeOf(!!head.is_compulsory),
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return created.id as string;
  };

  const validateClasses = async (classIds: string[]): Promise<void> => {
    const { data: rows } = await supabase.from("classes").select("id").eq("school_id", school_id).in("id", classIds);
    const found = new Set((rows || []).map((r) => (r as { id: string }).id));
    const missing = classIds.filter((c) => !found.has(c));
    if (missing.length > 0) throw new Error("Some classes do not belong to this school");
  };

  // The default a class would inherit (school-wide > section) — used to decide
  // whether "clear" must write an explicit ₦0 override or can just delete.
  const defaultForClass = async (classId: string): Promise<number> => {
    const { data: cls } = await supabase.from("classes").select("section_id").eq("id", classId).maybeSingle();
    const sectionId = (cls as { section_id: string | null } | null)?.section_id ?? null;
    const { data: sw } = await supabase
      .from("term_fees")
      .select("default_amount")
      .eq("school_id", school_id)
      .eq("fee_head_id", fee_head_id)
      .is("academic_section_id", null)
      .is("term_id", null)
      .maybeSingle();
    const swAmount = sw ? Number((sw as { default_amount: number }).default_amount) : 0;
    if (swAmount > 0) return swAmount;
    if (sectionId) {
      const { data: sec } = await supabase
        .from("term_fees")
        .select("default_amount")
        .eq("school_id", school_id)
        .eq("fee_head_id", fee_head_id)
        .eq("academic_section_id", sectionId)
        .is("term_id", null)
        .maybeSingle();
      const secAmount = sec ? Number((sec as { default_amount: number }).default_amount) : 0;
      if (secAmount > 0) return secAmount;
    }
    return 0;
  };

  try {
    if (action === "set_compulsory") {
      const isCompulsory = body.is_compulsory !== false;
      await supabase.from("fee_heads").update({ is_compulsory: isCompulsory }).eq("id", fee_head_id).eq("school_id", school_id);
      await supabase
        .from("term_fees")
        .update({ fee_type: feeTypeOf(isCompulsory) })
        .eq("school_id", school_id)
        .eq("fee_head_id", fee_head_id);
      return NextResponse.json({ ok: true, is_compulsory: isCompulsory });
    }

    if (action === "set_default") {
      const amount = amt(body.amount);
      if (amount === null || amount < 0) return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
      const parentId = await ensureParent();
      await supabase
        .from("term_fees")
        .update({ default_amount: amount, fee_type: feeTypeOf(!!head.is_compulsory), is_active: true })
        .eq("id", parentId)
        .eq("school_id", school_id);
      return NextResponse.json({ ok: true, default_amount: amount });
    }

    if (action === "set_classes") {
      const classIds: string[] = Array.isArray(body.class_ids) ? body.class_ids : [];
      const amount = amt(body.amount);
      if (classIds.length === 0) return NextResponse.json({ error: "class_ids is required" }, { status: 400 });
      if (amount === null || amount <= 0) return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
      await validateClasses(classIds);
      const parentId = await ensureParent();
      const isCompulsory = !!head.is_compulsory;
      let updated = 0;
      for (const classId of classIds) {
        const { data: existing } = await supabase
          .from("class_fees")
          .select("id")
          .eq("term_fee_id", parentId)
          .eq("class_id", classId)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("class_fees")
            .update({ amount, is_compulsory: isCompulsory })
            .eq("id", existing.id)
            .eq("school_id", school_id);
        } else {
          await supabase.from("class_fees").insert({ school_id, term_fee_id: parentId, class_id: classId, amount, is_compulsory: isCompulsory });
        }
        updated += 1;
      }
      return NextResponse.json({ ok: true, updated });
    }

    if (action === "clear_classes") {
      const classIds: string[] = Array.isArray(body.class_ids) ? body.class_ids : [];
      if (classIds.length === 0) return NextResponse.json({ error: "class_ids is required" }, { status: 400 });
      await validateClasses(classIds);
      const parentId = await ensureParent();
      let updated = 0;
      for (const classId of classIds) {
        const hasDefault = (await defaultForClass(classId)) > 0;
        const { data: existing } = await supabase
          .from("class_fees")
          .select("id")
          .eq("term_fee_id", parentId)
          .eq("class_id", classId)
          .maybeSingle();
        if (hasDefault) {
          // A default exists → blank the class with an explicit ₦0 override
          // (billing skips ₦0 lines, so this class is not charged).
          if (existing) {
            await supabase.from("class_fees").update({ amount: 0 }).eq("id", existing.id).eq("school_id", school_id);
          } else {
            await supabase.from("class_fees").insert({
              school_id,
              term_fee_id: parentId,
              class_id: classId,
              amount: 0,
              is_compulsory: !!head.is_compulsory,
            });
          }
        } else if (existing) {
          // No default → remove the override; the class simply has no fee.
          await supabase.from("class_fees").delete().eq("id", existing.id).eq("school_id", school_id);
        }
        updated += 1;
      }
      return NextResponse.json({ ok: true, updated });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update fee matrix";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
