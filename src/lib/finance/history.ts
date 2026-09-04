// ============================================================================
// Finance — audit/history service (Phase 4)
// Merges the dedicated financial records into one chronological timeline.
// The financial tables remain the source of truth; this read-side view only
// joins them for humans to trace WHY a balance is what it is.
// ============================================================================

import { round2 } from "./billing";

type Supabase = ReturnType<typeof import("@/lib/supabase/service").getServiceClient>;

export type HistoryEvent = {
  id: string;
  at: string;
  kind:
    | "fee_change"
    | "payment"
    | "void"
    | "adjustment"
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
  limit?: number;
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

const money = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

export async function loadHistory(supabase: Supabase, school_id: string, opts: HistoryOptions = {}): Promise<HistoryEvent[]> {
  const limit = opts.limit || 150;
  const events: HistoryEvent[] = [];

  // ── actor names (best-effort; falls back to null when ids are not profiles) ──
  const actorName = new Map<string, string>();
  const noteActorId = (id: string | null | undefined) => {
    if (id) actorName.set(id, "");
  };

  // 1) Payments (+ voids)
  let q1 = supabase
    .from("payments")
    .select("id, student_id, amount, method, reference, receipt_number, paid_at, status, notes, recorded_by, voided_by, students(first_name, last_name)")
    .eq("school_id", school_id)
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (opts.student_id) q1 = q1.eq("student_id", opts.student_id);
  if (opts.term_id) q1 = q1.eq("term_id", opts.term_id);
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

  // 2) Waivers
  let q2 = supabase
    .from("student_waivers")
    .select("id, student_id, term_id, fee_head_id, amount, reason, actor_id, created_at, students(first_name, last_name), fee_heads(id, name)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.student_id) q2 = q2.eq("student_id", opts.student_id);
  if (opts.term_id) q2 = q2.eq("term_id", opts.term_id);
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

  // 3) Financial adjustments (obligation changes)
  let q3 = supabase
    .from("financial_adjustments")
    .select("id, student_id, fee_head_id, before_amount, after_amount, adjustment_type, reason, actor_id, created_at, students(first_name, last_name), fee_heads(id, name)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.student_id) q3 = q3.eq("student_id", opts.student_id);
  if (opts.term_id) q3 = q3.eq("term_id", opts.term_id);
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
    events.push({
      id: `adj-${a.id}`,
      at: a.created_at,
      kind: "adjustment",
      title: `Obligation adjusted — ${feeName}`,
      detail: `${money(a.before_amount)} → ${money(a.after_amount)}${a.reason ? ` · ${a.reason}` : ""}`,
      amount: round2(Number(a.after_amount) - Number(a.before_amount)),
      student_name: studentName(a.students),
      student_id: a.student_id,
      actor_id: a.actor_id,
      actor: null,
    });
  }

  // 4) Credits created
  let q4 = supabase
    .from("credits")
    .select("id, student_id, amount, reason, source, source_fee_head_id, created_by, created_at, students(first_name, last_name), fee_heads(id, name)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.student_id) q4 = q4.eq("student_id", opts.student_id);
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

  // 5) Credit applications
  let q5 = supabase
    .from("credit_applications")
    .select("id, student_id, amount, applied_by, created_at, students(first_name, last_name)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.student_id) q5 = q5.eq("student_id", opts.student_id);
  if (opts.term_id) q5 = q5.eq("term_id", opts.term_id);
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

  // 6) Recalculation runs (only when no student filter, or with a term filter)
  if (!opts.student_id || opts.term_id) {
    let q6 = supabase
      .from("bill_recalc_runs")
      .select("id, term_id, reason, students_affected, bills_affected, totals_before, totals_after, initiated_by, created_at, academic_terms(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.term_id) q6 = q6.eq("term_id", opts.term_id);
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
  if (!opts.student_id || opts.term_id) {
    let q7 = supabase
      .from("fee_change_events")
      .select("id, term_id, fee_head_id, action, scope, reason, actor_id, created_at, fee_heads(id, name), academic_terms(id, name)")
      .eq("school_id", school_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.term_id) q7 = q7.eq("term_id", opts.term_id);
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
