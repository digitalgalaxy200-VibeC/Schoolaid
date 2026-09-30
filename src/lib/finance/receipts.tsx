// ============================================================================
// Finance — receipts: numbering + PDF generation
// Numbering: {SCHOOL-CODE}-{YEAR}-{SEQUENCE}  e.g. SCH-IXBYKV8D-2026-0001
//   • School-specific prefix → cannot collide across schools
//   • The generator checks BOTH payments and receipts
// PDF: built with @react-pdf/renderer
//
// DESIGN: every measure comes from `document-theme.ts` — one type scale, one
// 4pt spacing grid, one border hierarchy — so this document and the invoice
// stay siblings. Three row shapes cover the whole document:
//   InfoBand      label-over-value cells (receipt band, student info)
//   StatementRow  label | value with divider (payment details, term summary)
//   LineItemTable header + rows + total, amounts right-aligned (allocations)
// The footer wording is deliberate and must not change.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatMoney } from "./currency";
import { DOC, formatDocumentDate } from "./document-theme";
import { NotoSansRegularBase64, NotoSansBoldBase64 } from "./embedded-fonts";

// The receipt prints ₦ / GH₵ / £ / € and names with diacritics — the built-in
// PDF fonts carry none of them. Noto Sans is embedded (base64) so the glyphs
// render identically locally and on serverless, with no file/CDN dependency.
Font.register({
  family: "SchoolAidSans",
  fonts: [
    { src: NotoSansRegularBase64, fontWeight: "normal" },
    { src: NotoSansBoldBase64, fontWeight: "bold" },
  ],
});

// ── Receipt number generation ────────────────────────────────────────────────

export async function generateReceiptNumber(supabase: SupabaseClient, school_id: string): Promise<string> {
  const { data: school } = await supabase.from("schools").select("code, slug").eq("id", school_id).maybeSingle();
  const prefixCode = school?.code || school?.slug?.toUpperCase().slice(0, 12) || "SCH";
  const clean = String(prefixCode).replace(/[^A-Z0-9-]/gi, "").slice(0, 12);
  const year = new Date().getFullYear();
  const prefix = `${clean}-${year}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ data: payCount }, { data: recCount }] = await Promise.all([
      supabase.from("payments").select("id").like("receipt_number", `${prefix}%`),
      supabase.from("receipts").select("id").like("receipt_number", `${prefix}%`),
    ]);
    const seq = (payCount?.length || 0) + (recCount?.length || 0) + 1;
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("payments").select("id").eq("receipt_number", candidate).maybeSingle(),
      supabase.from("receipts").select("id").eq("receipt_number", candidate).maybeSingle(),
    ]);
    if (!p && !r) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

// ── Receipt PDF ──────────────────────────────────────────────────────────────

export type ReceiptFeeRow = { fee: string; amount: number };
export type ReceiptAccountRow = { bank_name: string; account_name: string; account_number: string };

export type ReceiptPdfData = {
  school_name: string;
  school_motto?: string | null;
  school_address?: string | null;
  school_contacts?: string | null;
  school_website?: string | null;
  logo_data_url?: string | null;
  receipt_number: string;
  term_label?: string | null; // e.g. "Second Term · 2025/2026 Session"
  term_name?: string | null; // short term name, e.g. "Second Term"
  student_name: string;
  gender?: string | null;
  class_name?: string | null;
  parent_label?: string | null;
  amount: number;
  method: string;
  paid_into?: string | null;
  sender_name?: string | null;
  reference?: string | null;
  paid_at: string;
  /** payments.status at print time: active → PAID, voided → VOIDED. */
  payment_status?: string | null;
  // Current payment breakdown (fee allocations)
  breakdown?: ReceiptFeeRow[];
  // Cumulative term context — SNAPSHOTS taken at issuance (immutable)
  previously_paid?: number | null;
  previous_receipt_number?: string | null;
  total_paid_at_issue?: number | null;
  expected_at_issue?: number | null;
  balance_after: number;
  // Active school accounts (display only — never part of the transaction)
  accounts?: ReceiptAccountRow[];
  recorded_by?: string | null;
  currency: string; // school currency CODE (NGN, XOF, …) — symbol derived
};

const { color, size, space, radius } = DOC;

const styles = StyleSheet.create({
  page: {
    paddingTop: space.xl + space.sm,
    paddingBottom: space.xl + space.lg + space.lg + space.xs, // footer clearance
    paddingHorizontal: space.xl + space.sm,
    fontSize: size.body,
    fontFamily: "SchoolAidSans",
    color: color.text,
  },
  body: { flex: 1 },
  watermark: { position: "absolute", top: 190, left: 140, width: 300, height: 300, opacity: 0.05 },
  watermarkImg: { width: "100%", height: "100%", objectFit: "contain" },

  // Continuation header — page 2+ only, so every page is identifiable.
  continuation: {
    position: "absolute",
    top: space.md,
    left: space.xl + space.sm,
    right: space.xl + space.sm,
    fontSize: size.caption,
    color: color.faint,
  },

  // Header
  headerRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 54, height: 54, objectFit: "contain", marginRight: space.md + space.xs },
  logoFallback: {
    width: 48,
    height: 48,
    borderRadius: radius * 2,
    backgroundColor: color.brand,
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: space.sm - 1,
    marginRight: space.md + space.xs,
  },
  headerText: { flex: 1 },
  schoolName: { fontSize: size.school, fontWeight: "bold" },
  schoolMotto: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 2 },
  receiptTitle: { fontSize: size.title, fontWeight: "bold", letterSpacing: 1.5, marginTop: space.sm },
  termLine: { fontSize: size.body, color: color.muted, marginTop: space.xs - 2 },
  schoolMeta: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 2 },

  // Sections
  sectionTitle: {
    fontSize: size.section,
    fontWeight: "bold",
    color: color.brand,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: space.md,
    marginBottom: space.sm - 2,
  },
  box: { borderWidth: 1, borderColor: color.container, borderRadius: radius },
  tr: { flexDirection: "row" },
  rowTop: { borderTopWidth: 1, borderTopColor: color.separator },
  col: { flex: 1, paddingVertical: space.sm - 2, paddingHorizontal: space.md },
  colDivider: { borderRightWidth: 1, borderRightColor: color.separator },

  // Labels: band/table headers are uppercase captions; row labels sentence case.
  bandLabel: { fontSize: size.caption, color: color.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  bandValue: { fontSize: size.value, fontWeight: "bold" },
  th: { fontSize: size.caption, color: color.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  tdStrong: { fontSize: size.value, fontWeight: "bold" },
  tdMuted: { fontSize: size.caption, color: color.muted },

  // Statement rows (label | value) — values sit on the RIGHT, the same axis
  // as the allocation table amounts: label column identifies, value column
  // ends flush against the same margin everywhere in the document.
  lvLabel: { fontSize: size.body, color: color.muted },
  lvValue: { fontSize: size.value, fontWeight: "bold" },
  lvValueEmphasis: { fontSize: size.emphasis, color: color.brandDark },
  lvValueWide: { flex: 2 },
  lvValueRight: { textAlign: "right" },

  // Line-item table + band headers (one shade, one header text style)
  headShade: { backgroundColor: color.rowShade },
  allocFee: { flex: 3 },
  allocAmt: { flex: 1, textAlign: "right" },

  // Term summary emphasis
  balanceRow: { backgroundColor: color.brandLight },

  // Callout (payment channel)
  channelBox: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: color.brand,
    borderRadius: radius,
    backgroundColor: color.tint,
    flexDirection: "row",
  },
  channelLeft: { flex: 1, padding: space.sm + 2, borderRightWidth: 1, borderRightColor: color.brand },
  channelRight: { flex: 1.4, padding: space.sm + 2 },
  channelTitle: { fontSize: size.section, fontWeight: "bold", color: color.brand },
  channelCaption: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 2 },
  accountBank: { fontSize: size.value, fontWeight: "bold" },
  accountLine: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 3 },

  // Footer — pinned to every page; wording is deliberate and must not change.
  footerBlock: { position: "absolute", bottom: space.xl, left: space.xl + space.sm, right: space.xl + space.sm },
  footer: { fontSize: size.fine, color: color.faint, textAlign: "center" },
  footerPowered: { marginTop: 1, fontSize: 7, color: color.faint, textAlign: "center" },
});

/** The shaded label row of an InfoBand. */
function BandHeader({ labels }: { labels: string[] }) {
  return (
    <View style={[styles.tr, styles.headShade]}>
      {labels.map((label, i) => (
        <View key={label} style={[styles.col, i < labels.length - 1 ? styles.colDivider : {}]}>
          <Text style={styles.th}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A values row cell of an InfoBand. */
function BandValueCell({
  children,
  color,
  divider = false,
}: {
  children: string;
  color?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.col, divider ? styles.colDivider : {}]}>
      <Text style={[styles.tdStrong, color ? { color } : {}]}>{children}</Text>
    </View>
  );
}

/** A statement row: muted label | bold value. */
function StatementRow({
  label,
  value,
  emphasis = false,
  first = false,
  last = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.tr, first ? {} : styles.rowTop, last ? styles.balanceRow : {}]}>
      <View style={[styles.col, styles.colDivider]}>
        <Text style={styles.lvLabel}>{label}</Text>
      </View>
      <View style={[styles.col, styles.lvValueWide]}>
        <Text
          style={
            emphasis
              ? [styles.lvValue, styles.lvValueEmphasis, styles.lvValueRight]
              : [styles.lvValue, styles.lvValueRight]
          }
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  const currency = (n: number) => formatMoney(n, data.currency);
  const currentPaid = data.amount;
  const previously = data.previously_paid ?? null;
  const totalPaid = data.total_paid_at_issue ?? (previously === null ? currentPaid : previously + currentPaid);
  const expected = data.expected_at_issue;
  const parent = data.parent_label;
  // Keep the receipt to ONE page: cap the printed allocation rows; anything
  // beyond the cap is summarized instead of overflowing onto page two.
  const breakdownRows = data.breakdown || [];
  const MAX_ALLOC_ROWS = 12;
  const breakdownShown = breakdownRows.slice(0, MAX_ALLOC_ROWS);
  const breakdownHidden = breakdownRows.length - breakdownShown.length;

  const statusRaw = (data.payment_status ?? "active").toLowerCase();
  const statusLabel = statusRaw === "active" ? "PAID" : statusRaw.toUpperCase();
  const statusColor = statusRaw === "active" ? color.success : statusRaw === "voided" ? color.error : color.text;

  const studentMeta = [
    parent ? `Parent / Guardian · ${parent}` : null,
    data.gender ? `Gender · ${data.gender}` : null,
  ]
    .filter(Boolean)
    .join("   |   ");

  const schoolMeta = [data.school_address, data.school_contacts, data.school_website]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Page 2+ only: identify the continued document. */}
        <Text
          fixed
          style={styles.continuation}
          render={({ pageNumber }: { pageNumber: number }) =>
            pageNumber > 1 ? `${data.school_name} · Receipt ${data.receipt_number} (continued)` : ""
          }
        />

        <View style={styles.body}>
          {data.logo_data_url ? (
            <View style={styles.watermark}>
              <Image src={data.logo_data_url} style={styles.watermarkImg} />
            </View>
          ) : null}

          {/* ── Header ── */}
          <View style={styles.headerRow}>
            {data.logo_data_url ? (
              <Image src={data.logo_data_url} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>S</Text>
            )}
            <View style={styles.headerText}>
              <Text style={styles.schoolName}>{data.school_name}</Text>
              {data.school_motto ? <Text style={styles.schoolMotto}>{data.school_motto}</Text> : null}
              <Text style={styles.receiptTitle}>OFFICIAL PAYMENT RECEIPT</Text>
              {data.term_label ? <Text style={styles.termLine}>{data.term_label}</Text> : null}
              {schoolMeta ? <Text style={styles.schoolMeta}>{schoolMeta}</Text> : null}
            </View>
          </View>

  {/* ── Receipt / date / status band ── */}
          <View style={[styles.box, { marginTop: space.sm }]}>
            <BandHeader labels={["Receipt No.", "Date", "Payment Status"]} />
            <View style={[styles.tr, styles.rowTop]}>
              <BandValueCell divider>{data.receipt_number}</BandValueCell>
              <BandValueCell divider>{formatDocumentDate(data.paid_at)}</BandValueCell>
              <BandValueCell color={statusColor}>{statusLabel}</BandValueCell>
            </View>
          </View>

          {/* ── Student information ── */}
          <Text style={styles.sectionTitle}>Student Information</Text>
          <View style={styles.box}>
            <BandHeader labels={["Student Name", "Class", "Term"]} />
            <View style={[styles.tr, styles.rowTop]}>
              <BandValueCell divider>{data.student_name}</BandValueCell>
              <BandValueCell divider>{data.class_name || "—"}</BandValueCell>
              <BandValueCell>{data.term_name || data.term_label || "—"}</BandValueCell>
            </View>
            {studentMeta ? (
              <View style={[styles.tr, styles.rowTop]}>
                <View style={styles.col}>
                  <Text style={styles.tdMuted}>{studentMeta}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* ── Payment details ── */}
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.box}>
            <StatementRow label="Amount Received" value={currency(currentPaid)} emphasis first />
            <StatementRow label="Payment Method" value={data.method || "—"} />
            {data.paid_into ? <StatementRow label="Paid Into" value={data.paid_into} /> : null}
            {data.sender_name ? <StatementRow label="Sender / Depositor" value={data.sender_name} /> : null}
            {data.reference ? <StatementRow label="Reference" value={data.reference} /> : null}
          </View>

          {/* ── Payment allocation ── */}
          {breakdownShown.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Payment Allocation</Text>
              <View style={styles.box}>
                <View style={[styles.tr, styles.headShade]}>
                  <View style={[styles.col, styles.allocFee, styles.colDivider]}>
                    <Text style={styles.th}>Description</Text>
                  </View>
                  <View style={[styles.col, styles.allocAmt]}>
                    <Text style={[styles.th, { textAlign: "right" }]}>Amount</Text>
                  </View>
                </View>
                {breakdownShown.map((b, i) => (
                  <View key={`${b.fee}-${i}`} style={[styles.tr, styles.rowTop]}>
                    <View style={[styles.col, styles.allocFee, styles.colDivider]}>
                      <Text style={styles.lvValue}>{b.fee}</Text>
                    </View>
                    <View style={[styles.col, styles.allocAmt]}>
                      <Text style={[styles.lvValue, { textAlign: "right" }]}>{currency(b.amount)}</Text>
                    </View>
                  </View>
                ))}
                {breakdownHidden > 0 ? (
                  <View style={[styles.tr, styles.rowTop]}>
                    <View style={styles.col}>
                      <Text style={styles.tdMuted}>
                        + {breakdownHidden} more allocation{breakdownHidden > 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={[styles.tr, styles.rowTop, styles.headShade]}>
                  <View style={[styles.col, styles.allocFee, styles.colDivider]}>
                    <Text style={styles.lvValue}>Total — Current Payment</Text>
                  </View>
                  <View style={[styles.col, styles.allocAmt]}>
                    <Text style={[styles.lvValue, { textAlign: "right" }]}>{currency(currentPaid)}</Text>
                  </View>
                </View>
              </View>
            </>
          ) : null}

          {/* ── Term account summary ── */}
          <Text style={styles.sectionTitle}>Term Account Summary</Text>
          <View style={styles.box}>
            {previously !== null && previously > 0 ? (
              <StatementRow label="Previously Paid" value={currency(previously)} first />
            ) : null}
            {data.previous_receipt_number ? (
              <StatementRow
                label="Previous Receipt"
                value={data.previous_receipt_number}
                first={!(previously !== null && previously > 0)}
              />
            ) : null}
            <StatementRow
              label="Current Payment"
              value={currency(currentPaid)}
              first={!(previously !== null && previously > 0) && !data.previous_receipt_number}
            />
            <StatementRow label="Total Paid This Term" value={currency(totalPaid)} />
            {expected !== null && expected !== undefined ? (
              <StatementRow label="Total Expected" value={currency(expected)} />
            ) : null}
            <StatementRow label="Balance Remaining" value={currency(data.balance_after)} emphasis last />
          </View>

          {/* ── Payment channel (callout) ── */}
          {data.accounts && data.accounts.length > 0 ? (
            <View style={styles.channelBox}>
              <View style={styles.channelLeft}>
                <Text style={styles.channelTitle}>PAYMENT CHANNEL</Text>
                <Text style={styles.channelCaption}>Payments can also be made into</Text>
              </View>
              <View style={styles.channelRight}>
                {data.accounts.map((a) => (
                  <View key={`${a.bank_name}-${a.account_number}`} style={{ marginBottom: space.xs }}>
                    <Text style={styles.accountBank}>{a.bank_name}</Text>
                    <Text style={styles.accountLine}>
                      {a.account_name} · {a.account_number}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* Footer — pinned to every page's bottom; wording is deliberate and
            must not change. A direct child of Page so `absolute` measures
            against the page, not the content column. */}
        <View fixed style={styles.footerBlock}>
          <Text style={styles.footer}>This receipt is issued electronically by the school.</Text>
          <Text style={styles.footerPowered}>Powered by SchoolAid Finance</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument data={data} />);
}
