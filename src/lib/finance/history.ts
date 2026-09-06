// ============================================================================
// Finance — audit/history service (Phase 4)
// Merges the dedicated financial records into one chronological timeline.
// The financial tables remain the source of truth; this read-side view only
// joins them for humans to trace WHY a balance is what it is.
//
// FIN-002 Phase 4: filters are QUERY-BACKED, not UI-only — kind, term,
// student, method, receipt number and date range are applied to the
// underlying records before any event is built. When a kind that belongs to a
// single record type is chosen, only that source is queried.
// ============================================================================

import { round2 } from "./billing";
import { formatMoney } from "./currency";

type Supabase = ReturnType<typeof import("@/lib/supabase/service").getServiceClient>;

export type HistoryEvent = {
  id: string;
  at: string;
  kind:
    | "fee_change"
    | "payment"
    | "void"
    | "adjustment"
    | "fee_added"
    | "fee_removed"
    | "waiver"
    | "credit"
    | "credit_applied"
    | "recalc";
  title: string;
  detail: string | null;
  amount: number | null;
  student_name: string | null;
  student_id: string | null;
  actor_id?: string | null;
  actor: string | null;
};

export type HistoryOptions = {
  student_id?: string;
  kind?: string;
  term_id?: string;
  method?: string;
  receipt_number?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
};

// Which underlying record type owns each history kind (used to query ONLY the
// relevant source when a kind filter is active).
const KIND_SOURCE: Record<string, string> = {
  payment: "payments",
  void: "payments",
  waiver: "waivers",
  adjustment: "adjustments",
  fee_added: "adjustments",
  fee_removed: "adjustments",
  credit: "credits",
  credit_applied: "credit_applications",
  recalc: "recalc_runs",
  fee_change: "fee_change_events",
};

type StudentJoin = { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
const studentName = (join: StudentJoin): string => {
  const s = Array.isArray(join) ? join[0] : join;
  return s ? `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown" : "Unknown";
};
type NameJoin = { id: string; name: string } | { id: string; name: string }[] | null;
const nameOf = (join: NameJoin): string | null => {
  const j = Array.isArray(join) ? join[0] : join;
  return j?.name || null;
};

export async function loadHistory(supabase: Supabase, school_id: string, opts: HistoryOptions = {}): Promise<HistoryEvent[]> {
  const limit = Math.min(500, opts.limit || 200);
  const events: HistoryEvent[] = [];
  const onlySource = opts.kind ? KIND_SOURCE[opts.kind] || null : null;

  // School currency (code) — history text is server-formatted.
  const { data: schoolRow } = await supabase.from("schools").select("currency").eq("id", school_id).maybeSingle();
  const schoolCurrency = (schoolRow as { currency?: string | null } | null)?.currency || null;
  const money = (n: number) => formatMoney(n, schoolCurrency);

  // ── actor names (best-effort; falls back to null when ids are not profiles) ──
  const actorName = new Map<string, string>();
  const noteActorId = (id: string | null | undefined) => {
    if (id) actorName.set(id, "");
  };

  // 1) Payments (+ voids)
  if (!onlySource || onlySource === "payments") {
    let q1 = supabase
      .from("payments")
      .select("id, student_id, amount, method, reference, receipt_number, paid_at, status, notes, recorded_by, voided_by, students(first_name, last_name)")
      .eq("school_id", school_id)
      .order("paid_at", { ascending: false })
      .limit(limit);
    if (opts.student_id) q1 = q1.eq("student_id", opts.student_id);
    if (opts.term_id) q1 = q1.eq("term_id", opts.term_id);
    if (opts.method) q1 = q1.eq("method", opts.method);
    if (opts.receipt_number) q1 = q1.ilike("receipt_number", `%${opts.receipt_number}%`);
    if (opts.date_from) q1 = q1.gte("paid_at", opts.date_from);
    if (opts.date_to) q1 = q1.lte("paid_at", opts.date_to);
    const { data: payments } = await q1;
    for (const p of (payments || []) as {
      id: string;
      student_id: string;
      amount: number;
      method: string | null;
      reference: string | null;
      receipt_number: string | null;
      paid_at: string;
      status: string;
      notes: string | null;
      recorded_by: string | null;
      voided_by: string | null;
      students: StudentJoin;
    }[]) {
      const voided = p.status === "voided";
      const actorId = voided ? p.voided_by : p.recorded_by;
      noteActorId(actorId);
      events.push({
        id: `pay-${p.id}`,
        at: p.paid_at,
        kind: voided ? "void" : "payment",
        title: voided ? `Payment voided — ${money(p.amount)}` : `Payment received — ${money(p.amount)}${p.method ? ` (${p.method})` : ""}`,
        detail: [p.reference && `Ref: ${p.reference}`, p.receipt_number && `Receipt: ${p.receipt_number}`, voided && p.notes ? `Reason: ${p.notes}` : null]
          .filter(Boolean)
          .join(" · ") || null,
        amount: Number(p.amount),
        student_name: studentName(p.students),
        student_id: p.student_id,
        actor_id: actorId,
        actor: null,
      });
    }
  }

  // 2) Waivers
  if (!onlySource || onlySource === "waivers") {
    let q2 = supabase
      .from("student_waivers")
      .select("id, student_id, term_id, fee_head_id, amount, reason, actor_id, created_at, students(first_name, last_name), fee_heads(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.student_id) q2 = q2.eq("student_id", opts.student_id);
    if (opts.term_id) q2 = q2.eq("term_id", opts.term_id);
    if (opts.date_from) q2 = q2.gte("created_at", opts.date_from);
    if (opts.date_to) q2 = q2.lte("created_at", opts.date_to);
    const { data: waivers } = await q2;
    for (const w of (waivers || []) as {
      id: string;
      student_id: string;
      amount: number;
      fee_head_id: string | null;
      reason: string | null;
      actor_id: string | null;
      created_at: string;
      students: StudentJoin;
      fee_heads: NameJoin;
    }[]) {
      noteActorId(w.actor_id);
      const feeName = nameOf(w.fee_heads);
      events.push({
        id: `wav-${w.id}`,
        at: w.created_at,
        kind: "waiver",
        title: `Waiver granted — ${money(w.amount)}${feeName ? ` (${feeName})` : ""}`,
        detail: w.reason || null,
        amount: Number(w.amount),
        student_name: studentName(w.students),
        student_id: w.student_id,
        actor_id: w.actor_id,
        actor: null,
      });
    }
  }

  // 3) Financial adjustments (obligation changes) — optional-fee adds/removes
  //    surface as their own kinds (FIN-002), fee-change/manual stay "adjustment".
  if (!onlySource || onlySource === "adjustments") {
    let q3 = supabase
      .from("financial_adjustments")
      .select("id, student_id, fee_head_id, before_amount, after_amount, adjustment_type, reason, actor_id, created_at, students(first_name, last_name), fee_heads(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.student_id) q3 = q3.eq("student_id", opts.student_id);
    if (opts.term_id) q3 = q3.eq("term_id", opts.term_id);
    if (opts.date_from) q3 = q3.gte("created_at", opts.date_from);
    if (opts.date_to) q3 = q3.lte("created_at", opts.date_to);
    const { data: adjustments } = await q3;
    for (const a of (adjustments || []) as {
      id: string;
      student_id: string;
      before_amount: number;
      after_amount: number;
      adjustment_type: string;
      reason: string | null;
      actor_id: string | null;
      created_at: string;
      students: StudentJoin;
      fee_heads: NameJoin;
    }[]) {
      noteActorId(a.actor_id);
      const feeName = nameOf(a.fee_heads) || "obligation";
      const type = a.adjustment_type;
      const kind = type === "fee_added" ? "fee_added" : type === "fee_removed" ? "fee_removed" : "adjustment";
      const title =
        kind === "fee_added"
          ? `Optional fee added — ${feeName} (${money(a.after_amount)})`
          : kind === "fee_removed"
            ? `Optional fee removed — ${feeName} (${money(a.before_amount)})`
            : `Obligation adjusted — ${feeName}`;
      events.push({
        id: `adj-${a.id}`,
        at: a.created_at,
        kind,
        title,
        detail: kind === "adjustment" ? `${money(a.before_amount)} → ${money(a.after_amount)}${a.reason ? ` · ${a.reason}` : ""}` : a.reason || null,
        amount: round2(Number(a.after_amount) - Number(a.before_amount)),
        student_name: studentName(a.students),
        student_id: a.student_id,
        actor_id: a.actor_id,
        actor: null,
      });
    }
  }

  // 4) Credits created
  if (!onlySource || onlySource === "credits") {
    let q4 = supabase
      .from("credits")
      .select("id, student_id, amount, reason, source, source_fee_head_id, created_by, created_at, students(first_name, last_name), fee_heads(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.student_id) q4 = q4.eq("student_id", opts.student_id);
    if (opts.term_id) q4 = q4.eq("term_id", opts.term_id);
    if (opts.date_from) q4 = q4.gte("created_at", opts.date_from);
    if (opts.date_to) q4 = q4.lte("created_at", opts.date_to);
    const { data: credits } = await q4;
    for (const c of (credits || []) as {
      id: string;
      student_id: string;
      amount: number;
      reason: string | null;
      source: string;
      source_fee_head_id: string | null;
      created_by: string | null;
      created_at: string;
      students: StudentJoin;
      fee_heads: NameJoin;
    }[]) {
      noteActorId(c.created_by);
      const feeName = nameOf(c.fee_heads);
      events.push({
        id: `crd-${c.id}`,
        at: c.created_at,
        kind: "credit",
        title: `Credit created — ${money(c.amount)}${feeName ? ` (from ${feeName})` : ""}`,
        detail: c.reason || `Source: ${c.source}`,
        amount: Number(c.amount),
        student_name: studentName(c.students),
        student_id: c.student_id,
        actor_id: c.created_by,
        actor: null,
      });
    }
  }

  // 5) Credit applications
  if (!onlySource || onlySource === "credit_applications") {
    let q5 = supabase
      .from("credit_applications")
      .select("id, student_id, amount, applied_by, created_at, students(first_name, last_name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.student_id) q5 = q5.eq("student_id", opts.student_id);
    if (opts.term_id) q5 = q5.eq("term_id", opts.term_id);
    if (opts.date_from) q5 = q5.gte("created_at", opts.date_from);
    if (opts.date_to) q5 = q5.lte("created_at", opts.date_to);
    const { data: apps } = await q5;
    for (const a of (apps || []) as { id: string; student_id: string; amount: number; applied_by: string | null; created_at: string; students: StudentJoin }[]) {
      noteActorId(a.applied_by);
      events.push({
        id: `capp-${a.id}`,
        at: a.created_at,
        kind: "credit_applied",
        title: `Credit applied — ${money(a.amount)}`,
        detail: "Applied to a bill",
        amount: Number(a.amount),
        student_name: studentName(a.students),
        student_id: a.student_id,
        actor_id: a.applied_by,
        actor: null,
      });
    }
  }

  // 6) Recalculation runs (only when no student filter, or with a term filter)
  if ((!onlySource || onlySource === "recalc_runs") && (!opts.student_id || opts.term_id)) {
    let q6 = supabase
      .from("bill_recalc_runs")
      .select("id, term_id, reason, students_affected, bills_affected, totals_before, totals_after, initiated_by, created_at, academic_terms(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.term_id) q6 = q6.eq("term_id", opts.term_id);
    if (opts.date_from) q6 = q6.gte("created_at", opts.date_from);
    if (opts.date_to) q6 = q6.lte("created_at", opts.date_to);
    const { data: runs } = await q6;
    for (const r of (runs || []) as {
      id: string;
      reason: string | null;
      students_affected: number;
      bills_affected: number;
      totals_before: number;
      totals_after: number;
      initiated_by: string | null;
      created_at: string;
      academic_terms: NameJoin;
    }[]) {
      noteActorId(r.initiated_by);
      const termName = nameOf(r.academic_terms);
      events.push({
        id: `run-${r.id}`,
        at: r.created_at,
        kind: "recalc",
        title: `Recalculation run — ${r.bills_affected} bill(s), ${r.students_affected} student(s)`,
        detail: `${termName ? termName + " · " : ""}${money(r.totals_before)} → ${money(r.totals_after)}${r.reason ? ` · ${r.reason}` : ""}`,
        amount: null,
        student_name: null,
        student_id: null,
        actor_id: r.initiated_by,
        actor: null,
      });
    }
  }

  // 7) Fee setup changes (config-level; shown with term filter or on the school feed)
  if ((!onlySource || onlySource === "fee_change_events") && (!opts.student_id || opts.term_id)) {
    let q7 = supabase
      .from("fee_change_events")
      .select("id, term_id, fee_head_id, action, scope, reason, actor_id, created_at, fee_heads(id, name), academic_terms(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.term_id) q7 = q7.eq("term_id", opts.term_id);
    if (opts.date_from) q7 = q7.gte("created_at", opts.date_from);
    if (opts.date_to) q7 = q7.lte("created_at", opts.date_to);
    const { data: feeEvents } = await q7;
    for (const f of (feeEvents || []) as {
      id: string;
      action: string;
      scope: string;
      reason: string | null;
      actor_id: string | null;
      created_at: string;
      fee_heads: NameJoin;
      academic_terms: NameJoin;
    }[]) {
      noteActorId(f.actor_id);
      const feeName = nameOf(f.fee_heads) || "fee";
      const termName = nameOf(f.academic_terms);
      const actionLabel =
        f.action === "set_classes" ? "amounts set" : f.action === "clear_classes" ? "class(es) cleared" : f.action === "set_default" ? "default changed" : f.action === "set_compulsory" ? "required/optional changed" : f.action;
      events.push({
        id: `fee-${f.id}`,
        at: f.created_at,
        kind: "fee_change",
        title: `Fee setup change — ${feeName} (${actionLabel})`,
        detail: `${termName ? termName + " · " : ""}${f.reason || (f.scope === "template" ? "Template setup" : "Term setup")}`,
        amount: null,
        student_name: null,
        student_id: null,
        actor_id: f.actor_id,
        actor: null,
      });
    }
  }

  // ── resolve actor display names ──
  const actorIds = Array.from(actorName.keys());
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (profiles || []) as { id: string; full_name: string | null }[]) {
      actorName.set(p.id, p.full_name || "");
    }
  }
  for (const e of events) {
    if (e.actor_id) e.actor = actorName.get(e.actor_id) || null;
    else e.actor = null;
  }

  const sorted = events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return opts.kind ? sorted.filter((e) => e.kind === opts.kind) : sorted;
}
