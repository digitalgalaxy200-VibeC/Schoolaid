// Finance UI helpers — pure, client-safe. All money is formatted from
// numeric values only; presentation never changes stored data.
//
// Currency: the school's currency CODE (schools.currency) is loaded once by
// the Finance shell via /api/school-admin/finance/currency and cached here.
// Every money()/moneyShort() call in the finance screens renders with the
// school's symbol automatically (default NGN until the shell responds).

import { formatMoney, formatMoneyShort, currencyDef } from "@/lib/finance/currency";
import { billStatusText } from "@/lib/finance/status";

let currentCurrency = "NGN";

/** Called by the Finance shell after loading the school's currency code. */
export const setFinanceCurrency = (code?: string | null): void => {
  if (code && currencyDef(code).code === code.toUpperCase()) {
    currentCurrency = code.toUpperCase();
  }
};

/** The active currency code (NGN until the shell fetch resolves). */
export const financeCurrency = (): string => currentCurrency;

/** The active symbol (₦ / FCFA / …) for inline labels such as "Amount (₦)". */
export const currencySymbol = (): string => currencyDef(currentCurrency).symbol;

/** Receipt PDF endpoint. download=true forces the browser to save the file
 *  (attachment) instead of showing it in the tab. */
export const receiptPdfUrl = (receiptId: string, download = false): string =>
  `/api/school-admin/finance/receipts/${receiptId}/pdf${download ? "?download=1" : ""}`;

/**
 * Print a receipt without leaving the counter.
 *
 * The receipt is a PDF served by our own route, so it is printed through a
 * hidden same-origin frame: the bursar gets the browser's print dialog with the
 * receipt already laid out, and stays on the payment screen. If the browser
 * blocks printing inside a frame, we fall back to opening the PDF in a tab.
 */
export const printReceipt = (receiptId: string): void => {
  const url = receiptPdfUrl(receiptId);
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Receipt to print");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    } finally {
      // The frame has to outlive the print dialog, then it must go.
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
};

export const money = (n: number | string | null | undefined): string => formatMoney(n, currentCurrency);

export const moneyShort = (n: number | string | null | undefined): string => formatMoneyShort(n, currentCurrency);

export const billStatusLabel = (s: string): { label: string; badge: "default" | "success" | "warning" | "error" | "info" } => {
  const label = billStatusText(s);
  switch (s) {
    case "paid":
      return { label, badge: "success" };
    case "partial":
      return { label, badge: "warning" };
    case "pending":
    case "unpaid":
      return { label, badge: "error" };
    default:
      return { label, badge: "default" };
  }
};

export const paymentStatusLabel = (s: string): { label: string; badge: "default" | "success" | "warning" | "error" | "info" } => {
  if (s === "active") return { label: "Posted", badge: "success" };
  if (s === "voided") return { label: "Voided", badge: "error" };
  if (s === "reversed") return { label: "Reversed", badge: "error" };
  return { label: s, badge: "default" };
};

// Safe JSON fetchers — Finance screens must never crash on a non-array
// payload (e.g. an API returning { error: "..." } with a 4xx/5xx).
// They always resolve to [] / null so callers can .find/.map safely.

export async function fetchArray<T = unknown>(url: string, init?: RequestInit): Promise<T[]> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? (d as T[]) : [];
  } catch {
    return [];
  }
}

export async function fetchObject<T = unknown>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    const d = await res.json();
    return d && typeof d === "object" && !Array.isArray(d) ? (d as T) : null;
  } catch {
    return null;
  }
}
