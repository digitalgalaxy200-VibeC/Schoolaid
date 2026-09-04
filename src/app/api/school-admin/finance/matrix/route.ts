import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Fee Matrix — price every fee head for every class, scoped to ONE term.
//
// Term awareness (Phase 1):
//   - Every row the matrix writes is scoped to the selected academic term
//     (term_fees.term_id = selected term). Changing Term 1 never touches Term 2.
//   - Rows with term_id = NULL are legacy "template" configuration. They are
//     shown as available for copy (action copy_config) and nothing more; they
//     are never silently applied to a term.
//   - Every write that actually changes amounts records a fee_change_event.
//
//   GET  /finance/matrix?term_id=…
//   POST /finance/matrix { term_id, action, ... }:
//     set_default     { fee_head_id, amount }               — term default amount
//     set_classes     { fee_head_id, class_ids[], amount }  — price classes
//     clear_classes   { fee_head_id, class_ids[] }          — mark "not needed"
//     set_compulsory  { fee_head_id, is_compulsory }        — fee head nature
//     copy_config     { from: "template" }                  — copy legacy defaults
//
// (set_default is kept for API completeness; the matrix UI prices per class.)

type HeadRow = { id: string; name: string; is_compulsory: boolean; is_active: boolean };
type ClassRow = { id: string; name: string; section_id: string | null };
type TermFeeRow = {
  id: string;
  fee_head_id: string;
  default_amount: number;
  academic_section_id: string | null;
  fee_type: string;
  term_id: string | null;
};
type ClassFeeRow = { id: string; term_fee_id: string; class_id: string; amount: number; is_compulsory: boolean | null };
type TermRow = { id: string };

const feeTypeOf = (isCompulsory: boolean) => (isCompulsory ? "Required" : "Not Required");
const amt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");

  const supabase = getServiceClient();

  // ── Tenant isolation: the term must belong to this school ──
  if (termId) {
    const { data: term } = await supabase
      .from("academic_terms")
      .select("id")
      .eq("id", termId)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!term) return NextResponse.json({ error: "term_id does not belong to this school" }, { status: 400 });
  }

  const [{ data: heads }, { data: classes }, { data: sections }, { data: termFees }, { data: classFees }] =
    await Promise.all([
      supabase.from("fee_heads").select("id, name, is_compulsory, is_active").eq("school_id", school_id).order("name"),
      supabase.from("classes").select("id, name, section_id").eq("school_id", school_id).order("name"),
      supabase.from("academic_sections").select("id, name").eq("school_id", school_id).order("name"),
      supabase.from("term_fees").select("id, fee_head_id, default_amount, academic_section_id, fee_type, term_id").eq("school_id", school_id),
      supabase.from("class_fees").select("id, term_fee_id, class_id, amount, is_compulsory").eq("school_id", school_id),
    ]);

  const headRows = (heads || []) as HeadRow[];
  const classRows = (classes || []) as ClassRow[];
  const sectionRows = (sections || []) as { id: string; name: string }[];
  const allTf = (termFees || []) as TermFeeRow[];
  const allCf = (classFees || []) as ClassFeeRow[];

  // Which config is the matrix editing?
  //   termId given → that term's rows. No termId → legacy template (NULL) view.
  const tfRows = allTf.filter((t) => (termId ? t.term_id === termId : t.term_id === null));
  const cfRows = allCf.filter((c) => tfRows.some((t) => t.id === c.term_fee_id));

  const tfByHead = new Map<string, TermFeeRow>(); // school-wide row per head (this scope)
  const sectionTfByHead = new Map<string, TermFeeRow>(); // "head::section"
  for (const t of tfRows) {
    if (t.academic_section_id === null) {
      if (!tfByHead.has(t.fee_head_id)) tfByHead.set(t.fee_head_id, t);
    } else {
      const k = `${t.fee_head_id}::${t.academic_section_id}`;
      if (!sectionTfByHead.has(k)) sectionTfByHead.set(k, t);
    }
  }

  const cfByHeadClass = new Map<string, { id: string; amount: number }>();
  for (const c of cfRows) {
    const tf = tfByHead.get(allTf.find((t) => t.id === c.term_fee_id)?.fee_head_id || "");
    const fhId = tf ? tf.fee_head_id : undefined;
    if (fhId) cfByHeadClass.set(`${fhId}::${c.class_id}`, { id: c.id, amount: Number(c.amount) });
  }

  const defaults = headRows.map((h) => {
    const sw = tfByHead.get(h.id);
    return {
      ...h,
      default: sw && Number(sw.default_amount) > 0 ? { term_fee_id: sw.id, amount: Number(sw.default_amount) } : null,
    };
  });

  // Effective amount per (head, class) within THIS scope:
  // class override → section default → school-wide default → empty.
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

  // Template availability: unscoped (NULL-term) config exists to copy from?
  const templateTf = allTf.filter((t) => t.term_id === null);
  const templateTfIds = new Set(templateTf.map((t) => t.id));
  const templateHeads = new Set(templateTf.map((t) => t.fee_head_id));
  const templateClassCount = allCf.filter((c) => templateTfIds.has(c.term_fee_id)).length;

  return NextResponse.json({
    fee_heads: defaults,
    classes: classRows,
    sections: sectionRows,
    cells,
    has_config: tfRows.length > 0,
    template_available: templateHeads.size > 0 || templateClassCount > 0,
    template_head_count: templateHeads.size,
  });
}

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action, fee_head_id, term_id } = body;
  if (!action || !fee_head_id) return NextResponse.json({ error: "action and fee_head_id are required" }, { status: 400 });

  const supabase = getServiceClient();

  // ── Tenant isolation: fee head + term must belong to THIS school ──
  const { data: head } = await supabase
    .from("fee_heads")
    .select("id, name, is_compulsory")
    .eq("id", fee_head_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!head) return NextResponse.json({ error: "fee_head_id does not belong to this school" }, { status: 400 });

  let term: TermRow | null = null;
  if (term_id) {
    const { data: t } = await supabase
      .from("academic_terms")
      .select("id")
      .eq("id", term_id)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!t) return NextResponse.json({ error: "term_id does not belong to this school" }, { status: 400 });
    term = t;
  }

  // ── ensure the TERM-scoped school-wide term_fees row exists (parent for overrides) ──
  const ensureParent = async (targetTermId: string | null): Promise<string> => {
    let q = supabase
      .from("term_fees")
      .select("id")
      .eq("school_id", school_id)
      .eq("fee_head_id", fee_head_id)
      .is("academic_section_id", null);
    q = targetTermId ? q.eq("term_id", targetTermId) : q.is("term_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) return existing.id as string;
    const { data: created, error } = await supabase
      .from("term_fees")
      .insert({
        school_id,
        fee_head_id,
        academic_section_id: null,
        term_id: targetTermId,
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

  // The default a class would inherit in this term (school-wide > section).
  const defaultForClass = async (classId: string): Promise<number> => {
    const { data: cls } = await supabase.from("classes").select("section_id").eq("id", classId).maybeSingle();
    const sectionId = (cls as { section_id: string | null } | null)?.section_id ?? null;
    let q = supabase
      .from("term_fees")
      .select("default_amount")
      .eq("school_id", school_id)
      .eq("fee_head_id", fee_head_id)
      .is("academic_section_id", null);
    q = term ? q.eq("term_id", term.id) : q.is("term_id", null);
    const { data: sw } = await q.maybeSingle();
    const swAmount = sw ? Number((sw as { default_amount: number }).default_amount) : 0;
    if (swAmount > 0) return swAmount;
    if (sectionId) {
      const { data: sec } = await supabase
        .from("term_fees")
        .select("default_amount")
        .eq("school_id", school_id)
        .eq("fee_head_id", fee_head_id)
        .eq("academic_section_id", sectionId)
        .eq("term_id", term ? term.id : null)
        .maybeSingle();
      const secAmount = sec ? Number((sec as { default_amount: number }).default_amount) : 0;
      if (secAmount > 0) return secAmount;
    }
    return 0;
  };

  // Record a fee-change history event (evidence only — not the ledger).
  const logEvent = async (actionName: string, changes: unknown[], reason: string | null) => {
    await supabase.from("fee_change_events").insert({
      school_id,
      term_id: term ? term.id : null,
      fee_head_id,
      actor_id: userId || null,
      action: actionName,
      scope: term ? "term" : "template",
      reason: reason || null,
      changes: JSON.stringify(changes),
    });
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
      await logEvent("set_compulsory", [{ fee_head_id, is_compulsory: isCompulsory }], body.reason || null);
      return NextResponse.json({ ok: true, is_compulsory: isCompulsory });
    }

    if (action === "set_default") {
      const amount = amt(body.amount);
      if (amount === null || amount < 0) return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
      if (!term) return NextResponse.json({ error: "set_default requires term_id" }, { status: 400 });
      const parentId = await ensureParent(term.id);
      const before = await supabase.from("term_fees").select("default_amount").eq("id", parentId).maybeSingle();
      const beforeAmount = Number((before.data as { default_amount?: number } | null)?.default_amount ?? 0);
      if (beforeAmount !== amount) {
        await supabase
          .from("term_fees")
          .update({ default_amount: amount, fee_type: feeTypeOf(!!head.is_compulsory), is_active: true })
          .eq("id", parentId)
          .eq("school_id", school_id);
        await logEvent("set_default", [{ class_id: null, before: beforeAmount, after: amount }], body.reason || null);
      }
      return NextResponse.json({ ok: true, default_amount: amount });
    }

    if (action === "set_classes") {
      const classIds: string[] = Array.isArray(body.class_ids) ? body.class_ids : [];
      const amount = amt(body.amount);
      if (classIds.length === 0) return NextResponse.json({ error: "class_ids is required" }, { status: 400 });
      if (amount === null || amount <= 0) return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
      if (!term) return NextResponse.json({ error: "set_classes requires term_id" }, { status: 400 });
      await validateClasses(classIds);
      const parentId = await ensureParent(term.id);
      const isCompulsory = !!head.is_compulsory;
      const changes: { class_id: string; before: number | null; after: number }[] = [];
      let updated = 0;
      for (const classId of classIds) {
        const { data: existing } = await supabase
          .from("class_fees")
          .select("id, amount")
          .eq("term_fee_id", parentId)
          .eq("class_id", classId)
          .maybeSingle();
        const before = existing ? Number((existing as { amount: number }).amount) : null;
        if (existing) {
          if (before === amount) continue;
          await supabase
            .from("class_fees")
            .update({ amount, is_compulsory: isCompulsory })
            .eq("id", existing.id)
            .eq("school_id", school_id);
        } else {
          await supabase.from("class_fees").insert({ school_id, term_fee_id: parentId, class_id: classId, amount, is_compulsory: isCompulsory });
        }
        changes.push({ class_id: classId, before, after: amount });
        updated += 1;
      }
      if (changes.length > 0) await logEvent("set_classes", changes, body.reason || null);
      return NextResponse.json({ ok: true, updated });
    }

    if (action === "clear_classes") {
      const classIds: string[] = Array.isArray(body.class_ids) ? body.class_ids : [];
      if (classIds.length === 0) return NextResponse.json({ error: "class_ids is required" }, { status: 400 });
      if (!term) return NextResponse.json({ error: "clear_classes requires term_id" }, { status: 400 });
      await validateClasses(classIds);
      const parentId = await ensureParent(term.id);
      const changes: { class_id: string; before: number | null; after: 0 }[] = [];
      for (const classId of classIds) {
        const hasDefault = (await defaultForClass(classId)) > 0;
        const { data: existing } = await supabase
          .from("class_fees")
          .select("id, amount")
          .eq("term_fee_id", parentId)
          .eq("class_id", classId)
          .maybeSingle();
        const before = existing ? Number((existing as { amount: number }).amount) : null;
        if (hasDefault) {
          // A term default exists → blank the class with an explicit ₦0 override
          // (billing skips ₦0 lines, so this class is not charged).
          if (existing) {
            if (before === 0) continue;
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
        } else {
          continue;
        }
        changes.push({ class_id: classId, before, after: 0 });
      }
      if (changes.length > 0) await logEvent("clear_classes", changes, body.reason || null);
      return NextResponse.json({ ok: true, updated: changes.length });
    }

    if (action === "copy_config") {
      // Copy the legacy (term_id = NULL) template configuration into this term.
      if (!term) return NextResponse.json({ error: "copy_config requires term_id" }, { status: 400 });
      const from = body.from === "template" ? "template" : "template"; // Phase 1: template only
      const { data: tplTf } = await supabase
        .from("term_fees")
        .select("id, fee_head_id, default_amount, fee_type")
        .eq("school_id", school_id)
        .is("term_id", null)
        .is("academic_section_id", null);
      const tplRows = (tplTf || []) as { id: string; fee_head_id: string; default_amount: number; fee_type: string }[];
      if (tplRows.length === 0) return NextResponse.json({ error: "No template configuration found to copy" }, { status: 404 });

      const templateIdSet = new Set(tplRows.map((t) => t.id));
      const { data: tplCf } = await supabase
        .from("class_fees")
        .select("class_id, amount, term_fee_id")
        .eq("school_id", school_id)
        .in("term_fee_id", Array.from(templateIdSet));

      let copied = 0;
      const summary: { fee_head_id: string; classes: number }[] = [];
      for (const tpl of tplRows) {
        const { data: existing } = await supabase
          .from("term_fees")
          .select("id")
          .eq("school_id", school_id)
          .eq("fee_head_id", tpl.fee_head_id)
          .is("academic_section_id", null)
          .eq("term_id", term.id)
          .maybeSingle();
        let parentId = existing?.id as string | undefined;
        if (!parentId) {
          const { data: created, error } = await supabase
            .from("term_fees")
            .insert({
              school_id,
              fee_head_id: tpl.fee_head_id,
              academic_section_id: null,
              term_id: term.id,
              default_amount: Number(tpl.default_amount),
              fee_type: tpl.fee_type,
              is_active: true,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          parentId = created.id as string;
        }
        let classCount = 0;
        for (const cf of (tplCf || []) as { class_id: string; amount: number; term_fee_id: string }[]) {
          if (cf.term_fee_id !== tpl.id) continue;
          const { data: cfExists } = await supabase
            .from("class_fees")
            .select("id")
            .eq("term_fee_id", parentId)
            .eq("class_id", cf.class_id)
            .maybeSingle();
          if (cfExists) continue; // never overwrite an existing term override
          await supabase.from("class_fees").insert({
            school_id,
            term_fee_id: parentId,
            class_id: cf.class_id,
            amount: Number(cf.amount),
            is_compulsory: !!head.is_compulsory,
          });
          classCount += 1;
        }
        if (classCount > 0 || existing) {
          copied += classCount;
          summary.push({ fee_head_id: tpl.fee_head_id, classes: classCount });
        }
      }
      if (summary.length > 0) {
        await logEvent("copy_config", summary, body.reason || null);
      }
      return NextResponse.json({ ok: true, from, copied_classes: copied, heads: summary.length });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update fee matrix";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
