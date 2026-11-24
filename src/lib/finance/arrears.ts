// ============================================================================
// Finance — arrears (money still owed from EARLIER terms)
//
// WHY THIS IS A READ, NOT A CHARGE
// --------------------------------
// Schools live with arrears: a parent clears part of last term's fees in the
// middle of this one. The old screens showed only the selected term, so that
// debt vanished the moment the term changed — a bursar could not answer "what
// does this family owe us?" without opening old terms one by one.
//
// The tempting fix is to copy the old balance onto the new bill. We do not:
// copying money creates a second record of the same debt, and the day someone
// waives or voids either copy, the two disagree. Arrears are derived from the
// bills that already exist, every time, and shown beside the current balance.
// Nothing is written, nothing is duplicated, and a void or waiver is reflected
// immediately.
// ============================================================================

export type ArrearsBill = { id: string; student_id: string; term_id: string; net_amount: number };

export type ArrearsTerm = { term_id: string; name: string | null; start_date: string; outstanding: number };

export type ArrearsResult = {
  /** Everything owed from terms that started before the selected one. */
  amount: number;
  /** Per student, for list screens. */
  byStudent: Map<string, number>;
  /** Per bill, for drill-down. */
  byBill: Map<string, number>;
  /** Oldest first, so "which year" is obvious. */
  byTerm: ArrearsTerm[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param bills        every bill on file for the students in scope, any term
 * @param currentTerm  the term being viewed: only strictly earlier terms count
 * @param termStart    term_id → start_date (YYYY-MM-DD)
 * @param termName     term_id → display name (optional)
 * @param paidByBill   posted payment allocations per bill
 * @param appliedByBill credit explicitly applied per bill
 */
export function computeArrears(input: {
  bills: ArrearsBill[];
  currentTermId: string;
  termStart: Map<string, string>;
  termName?: Map<string, string>;
  paidByBill: Map<string, number>;
  appliedByBill: Map<string, number>;
}): ArrearsResult {
  const currentStart = input.termStart.get(input.currentTermId);
  const byStudent = new Map<string, number>();
  const byBill = new Map<string, number>();
  const perTerm = new Map<string, number>();
  let total = 0;

  // Without the current term's start date there is no honest way to say what is
  // "earlier", so we report nothing rather than guess.
  if (!currentStart) return { amount: 0, byStudent, byBill, byTerm: [] };

  for (const bill of input.bills) {
    const start = input.termStart.get(bill.term_id);
    if (!start || start >= currentStart) continue;

    const outstanding = round2(
      Math.max(
        0,
        Number(bill.net_amount) -
          (input.paidByBill.get(bill.id) || 0) -
          (input.appliedByBill.get(bill.id) || 0),
      ),
    );
    if (outstanding <= 0) continue;

    byBill.set(bill.id, outstanding);
    byStudent.set(bill.student_id, round2((byStudent.get(bill.student_id) || 0) + outstanding));
    perTerm.set(bill.term_id, round2((perTerm.get(bill.term_id) || 0) + outstanding));
    total = round2(total + outstanding);
  }

  const byTerm: ArrearsTerm[] = Array.from(perTerm.entries())
    .map(([term_id, outstanding]) => ({
      term_id,
      name: input.termName?.get(term_id) ?? null,
      start_date: input.termStart.get(term_id) || "",
      outstanding,
    }))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));

  return { amount: total, byStudent, byBill, byTerm };
}
