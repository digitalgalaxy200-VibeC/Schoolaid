// ============================================================================
// Finance — document design tokens (receipts, invoices, any future document)
//
// ONE set of values, so a receipt, an invoice and anything else the school
// prints cannot drift apart. Every size, spacing step, colour and border in a
// document comes from here — a document component with a magic number in it is
// a future inconsistency.
//
// The palette mirrors the app theme (src/app/globals.css) so paper and screen
// agree: cobalt brand, the same success/error colours, the same greys.
// ============================================================================

export const DOC = {
  color: {
    /** Brand cobalt — section headings, borders of callouts, emphasis values. */
    brand: "#2A4B8D",
    brandDark: "#1D3766",
    /** Very light cobalt — highlighted rows and tinted callout backgrounds. */
    brandLight: "#E8EEFA",
    tint: "#F4F7FD",
    /** Text: primary, supporting, footnotes. */
    text: "#16202E",
    muted: "#4B5666",
    faint: "#8891A0",
    /** Border hierarchy: container → internal separator. */
    container: "#C9CFD8",
    separator: "#E2E5EA",
    rowShade: "#F5F6F8",
    success: "#1D9A5B",
    error: "#D64545",
  },
  /** Type scale — 7 steps, nothing in between. */
  size: {
    caption: 8.5,
    body: 10,
    section: 10.5,
    value: 11,
    emphasis: 12.5,
    title: 12.5,
    school: 19,
    /** Small print (footer). Conventionally below the scale. */
    fine: 7.5,
  },
  /** Spacing on a 4pt grid. */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: 3,
} as const;

/**
 * A date for documents: "30 Sep 2026".
 *
 * Tables in the app use the compact platform format (dd/MMM/yy) — right for a
 * column of rows, wrong for a financial document someone keeps for years.
 */
export function formatDocumentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
