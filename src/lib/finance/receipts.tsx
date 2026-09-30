// ============================================================================
// Finance — receipts: numbering + PDF generation
// Numbering: {SCHOOL-CODE}-{YEAR}-{SEQUENCE}  e.g. SCH-IXBYKV8D-2026-0001
//   • School-specific prefix → cannot collide across schools
//   • The generator checks BOTH payments and receipts
// PDF: built with @react-pdf/renderer
//
// DESIGN (professional receipt, A4):
//   Bordered section tables in the SchoolAid cobalt palette. Every value is
//   database-driven — see ReceiptPdfData for each field's source. The footer
//   wording is deliberate and must not change ("Powered by SchoolAid Finance").
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatMoney } from "./currency";
import { formatDate } from "@/lib/dates";
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

// SchoolAid brand tokens (sync with globals.css).
const BRAND = {
  primary: "#2A4B8D",
  primaryDark: "#1D3766",
  primaryLight: "#E8EEFA",
  tint: "#F4F7FD",
  text: "#16202E",
  muted: "#4B5666",
  border: "#E2E5EA",
  borderStrong: "#C9CFD8",
  rowShade: "#F5F6F8",
  success: "#1D9A5B",
  error: "#D64545",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 62,
    paddingHorizontal: 30,
    fontSize: 10,
    fontFamily: "SchoolAidSans",
    color: BRAND.text,
  },
  body: { flex: 1 },
  watermark: { position: "absolute", top: 190, left: 130, width: 300, height: 300, opacity: 0.05 },
  watermarkImg: { width: "100%", height: "100%", objectFit: "contain" },

  // Header
  headerRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 58, height: 58, objectFit: "contain", marginRight: 13 },
  logoFallback: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: BRAND.primary,
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: 9,
    marginRight: 13,
  },
  headerText: { flex: 1 },
  schoolName: { fontSize: 19, fontWeight: "bold", textAlign: "left" },
  schoolMotto: { fontSize: 9, color: BRAND.muted, marginTop: 1 },
  receiptTitle: { fontSize: 12.5, fontWeight: "bold", letterSpacing: 1.5, marginTop: 4 },
  termLine: { fontSize: 9.5, color: BRAND.muted, marginTop: 2 },
  schoolMeta: { fontSize: 8.5, color: BRAND.muted, marginTop: 1 },

  // Sections
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: BRAND.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 5,
  },
  box: { borderWidth: 1, borderColor: BRAND.borderStrong, borderRadius: 3 },
  tr: { flexDirection: "row" },
  rowTop: { borderTopWidth: 1, borderTopColor: BRAND.border },
  col: { flex: 1, paddingVertical: 6, paddingHorizontal: 9 },
  colDivider: { borderRightWidth: 1, borderRightColor: BRAND.border },

  // Metadata band + headers
  bandLabel: { fontSize: 8, color: BRAND.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  bandValue: { fontSize: 11, fontWeight: "bold" },
  th: { fontSize: 8.5, color: BRAND.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  tdStrong: { fontSize: 11, fontWeight: "bold" },
  tdMuted: { fontSize: 8.5, color: BRAND.muted },

  // Label / value rows
  lvLabel: { fontSize: 9.5, color: BRAND.muted },
  lvValue: { fontSize: 10, fontWeight: "bold" },
  lvValueEmphasis: { fontSize: 12, color: BRAND.primaryDark },
  lvValueWide: { flex: 2 },

  // Allocation table
  allocHead: { backgroundColor: BRAND.rowShade },
  allocFee: { flex: 3 },
  allocAmt: { flex: 1, textAlign: "right" },

  // Summary emphasis
  balanceRow: { backgroundColor: BRAND.primaryLight },

  // Payment channel
  channelBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BRAND.primary,
    borderRadius: 3,
    backgroundColor: BRAND.tint,
    flexDirection: "row",
  },
  channelLeft: { flex: 1, padding: 10, borderRightWidth: 1, borderRightColor: BRAND.primary },
  channelRight: { flex: 1.4, padding: 10 },
  channelTitle: { fontSize: 10, fontWeight: "bold", color: BRAND.primary },
  channelCaption: { fontSize: 8.5, color: BRAND.muted, marginTop: 2 },
  accountBank: { fontSize: 10, fontWeight: "bold" },
  accountLine: { fontSize: 8.5, color: BRAND.muted, marginTop: 1 },

  // Footer — pinned to the bottom of every page; wording is deliberate and
  // must not change.
  footerBlock: { position: "absolute", bottom: 24, left: 30, right: 30 },
  footer: { fontSize: 7.5, color: "#888", textAlign: "center" },
  footerPowered: { marginTop: 1, fontSize: 7, color: "#aaa", textAlign: "center" },
});

/** A bordered label/value row, two columns. */
function LabelValueRow({
  label,
  value,
  emphasis = false,
  first = false,
  last = false,
}: {
  label: string;
  value: string;
  /** Larger cobalt value — used for the amount and the balance. */
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
        <Text style={emphasis ? [styles.lvValue, styles.lvValueEmphasis] : styles.lvValue}>
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
  const statusColor = statusRaw === "active" ? BRAND.success : statusRaw === "voided" ? BRAND.error : BRAND.text;

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
          <View style={[styles.box, { marginTop: 10 }]}>
            <View style={[styles.tr, styles.allocHead]}>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.bandLabel}>Receipt No.</Text>
              </View>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.bandLabel}>Date</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.bandLabel}>Payment Status</Text>
              </View>
            </View>
            <View style={[styles.tr, styles.rowTop]}>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.bandValue}>{data.receipt_number}</Text>
              </View>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.bandValue}>{formatDate(data.paid_at)}</Text>
              </View>
              <View style={styles.col}>
                <Text style={[styles.bandValue, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          {/* ── Student information ── */}
          <Text style={styles.sectionTitle}>Student Information</Text>
          <View style={styles.box}>
            <View style={[styles.tr, styles.allocHead]}>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.th}>Student Name</Text>
              </View>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.th}>Class</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.th}>Term</Text>
              </View>
            </View>
            <View style={[styles.tr, styles.rowTop]}>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.tdStrong}>{data.student_name}</Text>
              </View>
              <View style={[styles.col, styles.colDivider]}>
                <Text style={styles.tdStrong}>{data.class_name || "—"}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.tdStrong}>{data.term_name || data.term_label || "—"}</Text>
              </View>
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
            <LabelValueRow
              label="Amount Received"
              value={currency(currentPaid)}
              emphasis
              first
            />
            <LabelValueRow label="Payment Method" value={data.method || "—"} />
            {data.paid_into ? <LabelValueRow label="Paid Into" value={data.paid_into} /> : null}
            {data.sender_name ? <LabelValueRow label="Sender / Depositor" value={data.sender_name} /> : null}
            {data.reference ? <LabelValueRow label="Reference" value={data.reference} /> : null}
          </View>

          {/* ── Payment allocation ── */}
          {breakdownShown.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Payment Allocation</Text>
              <View style={styles.box}>
                <View style={[styles.tr, styles.allocHead]}>
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
                <View style={[styles.tr, styles.rowTop, styles.allocHead]}>
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
              <LabelValueRow label="Previously Paid" value={currency(previously)} first />
            ) : null}
            {data.previous_receipt_number ? (
              <LabelValueRow
                label="Previous Receipt"
                value={data.previous_receipt_number}
                first={!(previously !== null && previously > 0)}
              />
            ) : null}
            <LabelValueRow
              label="Current Payment"
              value={currency(currentPaid)}
              first={!(previously !== null && previously > 0) && !data.previous_receipt_number}
            />
            <LabelValueRow label="Total Paid This Term" value={currency(totalPaid)} />
            {expected !== null && expected !== undefined ? (
              <LabelValueRow label="Total Expected" value={currency(expected)} />
            ) : null}
            <LabelValueRow
              label="Balance Remaining"
              value={currency(data.balance_after)}
              emphasis
              last
            />
          </View>

          {/* ── Payment channel ── */}
          {data.accounts && data.accounts.length > 0 ? (
            <View style={styles.channelBox}>
              <View style={styles.channelLeft}>
                <Text style={styles.channelTitle}>PAYMENT CHANNEL</Text>
                <Text style={styles.channelCaption}>Payments can also be made into</Text>
              </View>
              <View style={styles.channelRight}>
                {data.accounts.map((a) => (
                  <View key={`${a.bank_name}-${a.account_number}`} style={{ marginBottom: 4 }}>
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
