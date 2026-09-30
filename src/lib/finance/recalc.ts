// ============================================================================
// Finance — recalculation engine (Phase 2)
// Pure + deterministic. Preview and Apply both run through buildRecalcPlan so
// what the admin approves is exactly what gets written.
//
// A recalc compares each existing bill of a term against what the CURRENT
// term-aware fee configuration would produce for the SAME class-at-billing:
//   - line amounts that differ are updated (or added when new),
//   - fee heads that no longer apply are zeroed (never deleted — allocations
//     and history must survive),
//   - payments/allocations are never modified; if paid exceeds the new amount,
//     the excess is planned as credit (converted on Apply),
//   - waivers already granted are preserved; net is floored at zero.
// ============================================================================

import type { FeeConfig, BillLineInput } from "./billing";
import { resolveBillLines, round2 } from "./billing";

export type RecalcBillRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  status: string;
};

export type RecalcLineRow = {
  id: string;
  bill_id: string;
  fee_head_id: string;
  amount: number;
  waived_amount: number;
};

export type RecalcAllocRow = {
  id: string;
  bill_line_id: string;
  payment_id: string;
  amount: number;
};

export type NamedRow = { id: string; name: string };

export type RecalcInputs = {
  termId: string;
  bills: RecalcBillRow[];
  lines: RecalcLineRow[];
  allocs: RecalcAllocRow[]; // ACTIVE payment allocations only
  students: Map<string, string>; // id → display name
  classes: Map<string, string>; // id → name
  config: FeeConfig;
};

export type LineChange = {
  fee_head_id: string;
  fee_name: string;
  before: number;
  after: number;
  paid: number;
  overflow: number; // paid that exceeds the new amount (→ credit on apply)
  line_id: string | null; // null → a brand-new line must be inserted
  term_fee_id: string | null;
  class_fee_id: string | null;
  is_compulsory: boolean;
};

export type BillChange = {
  bill_id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  gross_before: number;
  gross_after: number;
  waiver_amount: number;
  net_before: number;
  net_after: number;
  status_after: string;
  changes: LineChange[];
};

export type RecalcPlan = {
  term_id: string;
  bills_affected: number;
  students_affected: number;
  totals_before: number;
  totals_after: number;
  difference: number;
  overflow_total: number;
  overflow_students: number;
  bills: BillChange[];
};

export const deriveStatusAfter = (netAfter: number, effectivePaid: number): string => {
  if (effectivePaid >= netAfter && netAfter > 0) return "paid";
  if (effectivePaid > 0) return "partial";
  return "pending";
};

export function buildRecalcPlan(inputs: RecalcInputs): RecalcPlan {
  const { termId, bills, lines, allocs, students, classes, config } = inputs;

  // paid per line (active allocations only)
  const paidByLine = new Map<string, number>();
  for (const a of allocs) {
    paidByLine.set(a.bill_line_id, round2((paidByLine.get(a.bill_line_id) || 0) + Number(a.amount)));
  }

  const linesByBill = new Map<string, RecalcLineRow[]>();
  for (const l of lines) {
    const list = linesByBill.get(l.bill_id) || [];
    list.push(l);
    linesByBill.set(l.bill_id, list);
  }

  const plan: RecalcPlan = {
    term_id: termId,
    bills_affected: 0,
    students_affected: 0,
    totals_before: 0,
    totals_after: 0,
    difference: 0,
    overflow_total: 0,
    overflow_students: 0,
    bills: [],
  };

  const affectedStudents = new Set<string>();

  for (const bill of bills) {
    const stored = linesByBill.get(bill.id) || [];
    // Resolve against the SAME class-at-billing — promotions never rewrite a term.
    const expected = resolveBillLines(config, { id: bill.student_id, class_id: bill.class_id }, termId).lines;

    const storedByHead = new Map<string, RecalcLineRow>();
    for (const l of stored) storedByHead.set(l.fee_head_id, l);

    const expectedByHead = new Map<string, BillLineInput>();
    for (const l of expected) expectedByHead.set(l.fee_head_id, l);

    const changes: LineChange[] = [];
    let overflowForBill = 0;

    // 1) stored lines vs expected (or removal → after 0)
    for (const l of stored) {
      const exp = expectedByHead.get(l.fee_head_id);
      const paid = round2(paidByLine.get(l.id) || 0);
      const before = round2(Number(l.amount));
      const after = exp ? round2(Number(exp.amount)) : 0;
      if (round2(before) === after && after > 0) continue; // unchanged
      if (after === 0 && before === 0 && paid === 0) continue; // already blank
      const payableAfter = after > 0 ? round2(Math.max(0, after - Number(l.waived_amount || 0))) : 0;
      const overflow = round2(Math.max(0, paid - payableAfter));
      overflowForBill = round2(overflowForBill + overflow);
      changes.push({
        fee_head_id: l.fee_head_id,
        fee_name: config.feeHeads.get(l.fee_head_id)?.name || "Fee",
        before,
        after,
        paid,
        overflow,
        line_id: l.id,
        term_fee_id: exp?.term_fee_id ?? null,
        class_fee_id: exp?.class_fee_id ?? null,
        is_compulsory: exp?.is_compulsory ?? true,
      });
    }

    // 2) expected heads that are NOT on the bill yet (fee added after generation)
    for (const exp of expected) {
      if (storedByHead.has(exp.fee_head_id)) continue;
      changes.push({
        fee_head_id: exp.fee_head_id,
        fee_name: config.feeHeads.get(exp.fee_head_id)?.name || "Fee",
        before: 0,
        after: round2(Number(exp.amount)),
        paid: 0,
        overflow: 0,
        line_id: null,
        term_fee_id: exp.term_fee_id,
        class_fee_id: exp.class_fee_id,
        is_compulsory: exp.is_compulsory,
      });
    }

    if (changes.length === 0) continue;

    const grossBefore = round2(stored.reduce((s, l) => s + Number(l.amount), 0));
    const grossAfter = round2(expected.reduce((s, l) => s + Number(l.amount), 0));
    const waiver = round2(Number(bill.waiver_amount || 0));
    const netBefore = round2(Math.max(0, grossBefore - waiver));
    const netAfter = round2(Math.max(0, grossAfter - waiver));

    const paidTotal = round2(stored.reduce((s, l) => s + (paidByLine.get(l.id) || 0), 0));
    const effectivePaid = round2(Math.max(0, paidTotal - overflowForBill));

    plan.bills.push({
      bill_id: bill.id,
      student_id: bill.student_id,
      student_name: students.get(bill.student_id) || "Unknown",
      class_name: bill.class_id ? classes.get(bill.class_id) || null : null,
      gross_before: grossBefore,
      gross_after: grossAfter,
      waiver_amount: waiver,
      net_before: netBefore,
      net_after: netAfter,
      status_after: deriveStatusAfter(netAfter, effectivePaid),
      changes,
    });

    affectedStudents.add(bill.student_id);
    plan.totals_before = round2(plan.totals_before + netBefore);
    plan.totals_after = round2(plan.totals_after + netAfter);
    plan.overflow_total = round2(plan.overflow_total + overflowForBill);
    if (overflowForBill > 0) plan.overflow_students += 1;
  }

  plan.bills_affected = plan.bills.length;
  plan.students_affected = affectedStudents.size;
  plan.difference = round2(plan.totals_after - plan.totals_before);
  return plan;
}
