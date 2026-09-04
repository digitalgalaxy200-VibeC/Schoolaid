// ============================================================================
// Finance — reporting & reconciliation service (Phase 5)
// Single source for all dashboard/report aggregations. Every figure is
// derived from real records: bills (expected), posted allocations (collected),
// never manually toggled flags.
// ============================================================================

export type PostedAlloc = { amount: number; payment_status: string | null };

// A payment counts as collected ONLY when its status is 'active' (posted).
export const isPosted = (row: PostedAlloc): boolean =>
  row.payment_status === "active";

// Accepts the nested `payments(status)` shape returned by Supabase joins.
export const isPostedPayment = (
  payments: { status: string | null | undefined } | { status: string | null | undefined }[] | null,
): boolean => {
  const st = Array.isArray(payments) ? payments[0]?.status : payments?.status;
  return st === "active";
};

export const sumPosted = (rows: PostedAlloc[]): number =>
  rows.reduce((s, r) => (isPosted(r) ? s + Number(r.amount) : s), 0);

export type BillStatus = "paid" | "partial" | "unpaid";

export function deriveBillStatus(net: number, paid: number): BillStatus {
  if (net <= 0 || paid >= net) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type SectionSummary = {
  id: string | null;
  name: string;
  expected: number;
  collected: number;
  outstanding: number;
  rate: number;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
};

export type ClassSummary = {
  id: string | null;
  name: string;
  section_id: string | null;
  expected: number;
  collected: number;
  outstanding: number;
  rate: number;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
};

export type FeeSummary = {
  fee_head_id: string;
  fee_name: string;
  expected: number;
  collected: number;
  outstanding: number;
};

export function safeRate(expected: number, collected: number): number {
  if (expected <= 0) return 0;
  return Math.round((collected / expected) * 100);
}

export function buildSectionSummaries(
  bills: { id: string; net_amount: number; class_id: string | null }[],
  paidByBill: Map<string, number>,
  classes: { id: string; name: string; section_id: string | null }[],
  sections: { id: string; name: string }[],
  appliedByBill?: Map<string, number>,
): { sections: SectionSummary[]; classes: ClassSummary[] } {
  const appliedMap = appliedByBill || new Map<string, number>();
  const classRows = classes.map((c) => ({ class: c, bills: [] as { net: number; paid: number; applied: number }[] }));
  const classIndex = new Map(classRows.map((r, i) => [r.class.id, i]));

  for (const b of bills) {
    const idx = b.class_id ? classIndex.get(b.class_id) : undefined;
    if (idx !== undefined) {
      classRows[idx].bills.push({
        net: Number(b.net_amount),
        paid: paidByBill.get(b.id) || 0,
        applied: appliedMap.get(b.id) || 0,
      });
    }
  }

  const classSummaries: ClassSummary[] = classRows
    .map(({ class: c, bills: bs }) => {
      const expected = round2(bs.reduce((s, b) => s + b.net, 0));
      const collected = round2(bs.reduce((s, b) => s + b.paid, 0));
      const appliedTotal = round2(bs.reduce((s, b) => s + b.applied, 0));
      const counts = { total: bs.length, paid: 0, partial: 0, unpaid: 0 };
      for (const b of bs) counts[deriveBillStatus(b.net, round2(b.paid + b.applied))] += 1;
      return {
        id: c.id,
        name: c.name,
        section_id: c.section_id,
        expected,
        collected,
        outstanding: round2(Math.max(0, expected - collected - appliedTotal)),
        rate: safeRate(expected, collected),
        student_counts: counts,
      };
    })
    .filter((c) => c.student_counts.total > 0);

  const sectionMap = new Map<string | null, SectionSummary>();
  const ensureSection = (id: string | null, name: string): SectionSummary => {
    const existing = sectionMap.get(id);
    if (existing) return existing;
    const created: SectionSummary = {
      id,
      name,
      expected: 0,
      collected: 0,
      outstanding: 0,
      rate: 0,
      student_counts: { total: 0, paid: 0, partial: 0, unpaid: 0 },
    };
    sectionMap.set(id, created);
    return created;
  };

  for (const c of classSummaries) {
    const sec = c.section_id ? sections.find((s) => s.id === c.section_id) : undefined;
    const summary = ensureSection(c.section_id, sec?.name || "Unassigned");
    summary.expected = round2(summary.expected + c.expected);
    summary.collected = round2(summary.collected + c.collected);
    summary.student_counts.total += c.student_counts.total;
    summary.student_counts.paid += c.student_counts.paid;
    summary.student_counts.partial += c.student_counts.partial;
    summary.student_counts.unpaid += c.student_counts.unpaid;
  }

  for (const s of sectionMap.values()) {
    s.outstanding = round2(Math.max(0, s.expected - s.collected));
    s.rate = safeRate(s.expected, s.collected);
  }

  return {
    sections: Array.from(sectionMap.values()),
    classes: classSummaries,
  };
}

export function buildFeeBreakdown(
  lines: { id: string; fee_head_id: string; amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null }[],
  paidByLine: Map<string, number>,
): FeeSummary[] {
  const map = new Map<string, FeeSummary>();
  for (const l of lines) {
    const fh = Array.isArray(l.fee_heads) ? l.fee_heads[0] : l.fee_heads;
    const key = l.fee_head_id;
    const cur = map.get(key) || {
      fee_head_id: key,
      fee_name: fh?.name || "Fee",
      expected: 0,
      collected: 0,
      outstanding: 0,
    };
    const amount = Number(l.amount);
    const paid = Math.min(amount, paidByLine.get(l.id) || 0);
    cur.expected = round2(cur.expected + amount);
    cur.collected = round2(cur.collected + paid);
    map.set(key, cur);
  }
  return Array.from(map.values()).map((f) => ({
    ...f,
    outstanding: round2(Math.max(0, f.expected - f.collected)),
  }));
}
