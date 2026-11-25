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
  /** Credit applied to bills, which reduces what is still owed. */
  applied: number;
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
  applied: number;
  outstanding: number;
  rate: number;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
};

/** Bills whose class no longer exists (or is unset) still owe money. They are
 * reported as one explicit bucket rather than dropped, so the class rows always
 * add up to the school total. */
export const UNASSIGNED_CLASS_ID = "__unassigned__";

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

  // A bill whose class is unset or was deleted is still real money. Bucket it
  // explicitly so `sum(by class)` equals the school total, always.
  let unassigned: { class: { id: string; name: string; section_id: string | null }; bills: { net: number; paid: number; applied: number }[] } | null = null;
  const unassignedIndex = () => {
    if (!unassigned) {
      unassigned = { class: { id: UNASSIGNED_CLASS_ID, name: "Unassigned", section_id: null }, bills: [] };
      classRows.push(unassigned);
    }
    return classRows.length - 1;
  };

  for (const b of bills) {
    const idx = b.class_id ? (classIndex.get(b.class_id) ?? unassignedIndex()) : unassignedIndex();
    classRows[idx].bills.push({
      net: Number(b.net_amount),
      paid: paidByBill.get(b.id) || 0,
      applied: appliedMap.get(b.id) || 0,
    });
  }

  const classSummaries: ClassSummary[] = classRows
    .map(({ class: c, bills: bs }) => {
      const expected = round2(bs.reduce((s, b) => s + b.net, 0));
      const collected = round2(bs.reduce((s, b) => s + b.paid, 0));
      const applied = round2(bs.reduce((s, b) => s + b.applied, 0));
      const counts = { total: bs.length, paid: 0, partial: 0, unpaid: 0 };
      for (const b of bs) counts[deriveBillStatus(b.net, round2(b.paid + b.applied))] += 1;
      // Clamped per bill, exactly as a bursar reads one student's row.
      const outstanding = round2(
        bs.reduce((s, b) => s + Math.max(0, b.net - b.paid - b.applied), 0),
      );
      return {
        id: c.id,
        name: c.name,
        section_id: c.section_id,
        expected,
        collected,
        applied,
        outstanding,
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
      applied: 0,
      outstanding: 0,
      rate: 0,
      student_counts: { total: 0, paid: 0, partial: 0, unpaid: 0 },
    };
    sectionMap.set(id, created);
    return created;
  };

  // Sections are the sum of their classes — not a second calculation. The old
  // version re-derived outstanding as expected − collected and dropped applied
  // credit, so a section could show money owed that the total said was covered.
  for (const c of classSummaries) {
    const sec = c.section_id ? sections.find((s) => s.id === c.section_id) : undefined;
    const summary = ensureSection(c.section_id, sec?.name || "Unassigned");
    summary.expected = round2(summary.expected + c.expected);
    summary.collected = round2(summary.collected + c.collected);
    summary.applied = round2(summary.applied + c.applied);
    summary.outstanding = round2(summary.outstanding + c.outstanding);
    summary.student_counts.total += c.student_counts.total;
    summary.student_counts.paid += c.student_counts.paid;
    summary.student_counts.partial += c.student_counts.partial;
    summary.student_counts.unpaid += c.student_counts.unpaid;
  }

  for (const s of sectionMap.values()) {
    s.rate = safeRate(s.expected, s.collected);
  }

  return {
    sections: Array.from(sectionMap.values()),
    classes: classSummaries,
  };
}

export function buildFeeBreakdown(
  lines: {
    id: string;
    fee_head_id: string;
    amount: number;
    waived_amount?: number | null;
    fee_heads: { id: string; name: string } | { id: string; name: string }[] | null;
  }[],
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
    // A waiver on a line is money the school has agreed NOT to collect. Using
    // the raw amount here made waived money reappear as outstanding.
    const netAmount = round2(Math.max(0, Number(l.amount) - Number(l.waived_amount || 0)));
    const paid = Math.min(netAmount, paidByLine.get(l.id) || 0);
    cur.expected = round2(cur.expected + netAmount);
    cur.collected = round2(cur.collected + paid);
    map.set(key, cur);
  }
  return Array.from(map.values()).map((f) => ({
    ...f,
    outstanding: round2(Math.max(0, f.expected - f.collected)),
  }));
}

export type FinanceSummary = {
  expected: number;
  collected: number;
  applied: number;
  outstanding: number;
  rate: number;
  counts: { total: number; paid: number; partial: number; unpaid: number };
  sections: SectionSummary[];
  classes: ClassSummary[];
  fee_breakdown: FeeSummary[];
};

/**
 * The one place the four figures on the Overview are computed.
 *
 * WHY IT EXISTS: Expected, Collected and Outstanding were assembled in the API
 * route while By Class, By Section and By Fee were assembled separately. Those
 * paths drifted (sections ignored applied credit), so the same screen could show
 * three different answers to "how much is still owed". Everything below is now
 * derived from the per-bill rows, and the total is the SUM of the class rows, so
 * `total === sum(by class) === sum(by section)` holds by construction.
 */
export function summariseBills(input: {
  bills: { id: string; net_amount: number; class_id: string | null }[];
  lines: Parameters<typeof buildFeeBreakdown>[0];
  paidByBill: Map<string, number>;
  paidByLine: Map<string, number>;
  appliedByBill: Map<string, number>;
  classes: { id: string; name: string; section_id: string | null }[];
  sections: { id: string; name: string }[];
}): FinanceSummary {
  const { sections, classes } = buildSectionSummaries(
    input.bills,
    input.paidByBill,
    input.classes,
    input.sections,
    input.appliedByBill,
  );

  const expected = round2(classes.reduce((s, c) => s + c.expected, 0));
  const collected = round2(classes.reduce((s, c) => s + c.collected, 0));
  const applied = round2(classes.reduce((s, c) => s + c.applied, 0));
  const outstanding = round2(classes.reduce((s, c) => s + c.outstanding, 0));

  const counts = { total: 0, paid: 0, partial: 0, unpaid: 0 };
  for (const c of classes) {
    counts.total += c.student_counts.total;
    counts.paid += c.student_counts.paid;
    counts.partial += c.student_counts.partial;
    counts.unpaid += c.student_counts.unpaid;
  }

  return {
    expected,
    collected,
    applied,
    outstanding,
    rate: safeRate(expected, collected),
    counts,
    sections,
    classes,
    fee_breakdown: buildFeeBreakdown(input.lines, input.paidByLine),
  };
}
