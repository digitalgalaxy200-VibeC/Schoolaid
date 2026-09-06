// ============================================================================
// Finance — workspace payment math (pure, single source)
// Used by the payments route and the automated tests so the numbers shown to
// a finance officer can never disagree with the engine.
// ============================================================================

import { round2 } from "./billing";

export type PaymentOutcome = {
  outstandingBefore: number;
  appliedToBill: number; // amount that pays down the bill
  excess: number; // amount that becomes student credit (never negative balance)
  totalPaidAtIssue: number; // cash paid this term including this payment
  balanceAfter: number; // >= 0 always
};

export function paymentOutcome(net: number, paidBefore: number, appliedCredit: number, amount: number): PaymentOutcome {
  const outstandingBefore = round2(Math.max(0, net - paidBefore - appliedCredit));
  const appliedToBill = round2(Math.min(amount, outstandingBefore));
  const excess = round2(Math.max(0, amount - appliedToBill));
  return {
    outstandingBefore,
    appliedToBill,
    excess,
    totalPaidAtIssue: round2(paidBefore + amount),
    balanceAfter: round2(Math.max(0, outstandingBefore - appliedToBill)),
  };
}

// Human status for a term account (workspace + invoice).
export function termStatus(net: number, paid: number, appliedCredit: number): "NOT PAID" | "PARTIALLY PAID" | "PAID" | "COMPLETED" {
  const outstanding = round2(Math.max(0, net - paid - appliedCredit));
  if (outstanding <= 0) return net > 0 ? "PAID" : "COMPLETED";
  if (paid > 0 || appliedCredit > 0) return "PARTIALLY PAID";
  return "NOT PAID";
}
