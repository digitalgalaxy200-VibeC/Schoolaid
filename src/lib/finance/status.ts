// ============================================================================
// Finance — the one status vocabulary
//
// The same student was described three ways on three screens: "Partially Paid"
// on Payments, "Partial" on the Overview, and "PARTIALLY PAID" in caps on the
// student page. A bursar reading one screen and phoning a parent about another
// should not have to translate.
//
// These are DISPLAY words. The stored and derived keys (`paid` / `partial` /
// `unpaid`, and the workspace's upper-case enum) are unchanged, so nothing in
// the database or the APIs shifts.
// ============================================================================

/** Paid · Part-paid · Unpaid — in that order, everywhere. */
export type AccountStatus = "paid" | "part_paid" | "unpaid";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  paid: "Paid",
  part_paid: "Part-paid",
  unpaid: "Unpaid",
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The status implied by a bill's figures. Credit counts as money received. */
export function accountStatus(
  net: number,
  paid: number,
  appliedCredit = 0,
): AccountStatus {
  const covered = round2(Number(paid) + Number(appliedCredit));
  if (net <= 0 || covered >= net) return "paid";
  return covered > 0 ? "part_paid" : "unpaid";
}

/** A stored bill status (`paid` / `partial` / `pending` / `unpaid`). */
export function billStatusText(status: string): string {
  switch (status) {
    case "paid":
      return ACCOUNT_STATUS_LABELS.paid;
    case "partial":
      return ACCOUNT_STATUS_LABELS.part_paid;
    case "pending":
    case "unpaid":
      return ACCOUNT_STATUS_LABELS.unpaid;
    default:
      return status;
  }
}

/** The workspace enum (`PAID` / `PARTIALLY PAID` / `NOT PAID` / `COMPLETED`). */
export function workspaceStatusText(status: string): string {
  switch (status) {
    case "PAID":
    case "COMPLETED":
      return ACCOUNT_STATUS_LABELS.paid;
    case "PARTIALLY PAID":
      return ACCOUNT_STATUS_LABELS.part_paid;
    case "NOT PAID":
      return ACCOUNT_STATUS_LABELS.unpaid;
    default:
      return status;
  }
}
