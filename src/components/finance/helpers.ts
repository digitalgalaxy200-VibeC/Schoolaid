// Finance UI helpers — pure, client-safe. All money is formatted from
// numeric values only; presentation never changes stored data.

export const money = (n: number | string | null | undefined): string =>
  `₦${Number(n || 0).toLocaleString()}`;

export const moneyShort = (n: number | string | null | undefined): string => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `₦${(v / 1_000).toFixed(0)}k`;
  return `₦${v.toLocaleString()}`;
};

export const billStatusLabel = (s: string): { label: string; badge: "default" | "success" | "warning" | "error" | "info" } => {
  switch (s) {
    case "paid":
      return { label: "Paid", badge: "success" };
    case "partial":
      return { label: "Partial", badge: "warning" };
    case "pending":
    case "unpaid":
      return { label: "Unpaid", badge: "error" };
    default:
      return { label: s, badge: "default" };
  }
};

export const paymentStatusLabel = (s: string): { label: string; badge: "default" | "success" | "warning" | "error" | "info" } => {
  if (s === "active") return { label: "Valid", badge: "success" };
  if (s === "voided") return { label: "Voided", badge: "error" };
  if (s === "reversed") return { label: "Reversed", badge: "error" };
  return { label: s, badge: "default" };
};
