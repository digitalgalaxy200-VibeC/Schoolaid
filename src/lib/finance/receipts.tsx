// ============================================================================
// Finance — receipts: numbering + PDF generation
// Numbering: {SCHOOL-CODE}-{YEAR}-{SEQUENCE}  e.g. SCH-IXBYKV8D-2026-0001
//   • School-specific prefix → cannot collide across schools
//   • The generator checks BOTH payments and receipts
// PDF: built with @react-pdf/renderer
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

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
  logo_data_url?: string | null;
  receipt_number: string;
  term_label?: string | null; // e.g. "Second Term · 2025/2026 Session"
  student_name: string;
  gender?: string | null;
  class_name?: string | null;
  parent_label?: string | null;
  amount: number;
  method: string;
  paid_into?: string | null;
  reference?: string | null;
  paid_at: string;
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
  currency: string;
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9.5, fontFamily: "Helvetica" },
  header: { marginBottom: 12, alignItems: "center" },
  logo: { width: 54, height: 54, marginBottom: 4, objectFit: "contain" },
  logoFallback: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#2563EB", color: "#fff", fontSize: 22, fontWeight: "bold", textAlign: "center", paddingTop: 6, marginBottom: 4 },
  schoolName: { fontSize: 15, fontWeight: "bold", textAlign: "center" },
  schoolMotto: { fontSize: 8.5, textAlign: "center", marginTop: 2, color: "#555" },
  schoolAddress: { fontSize: 8, textAlign: "center", marginTop: 1, color: "#777" },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "center", marginTop: 10, letterSpacing: 1.5 },
  termLine: { fontSize: 8.5, textAlign: "center", marginTop: 2, color: "#444" },
  sectionTitle: { fontSize: 9, fontWeight: "bold", marginTop: 10, marginBottom: 4, color: "#1D4ED8", textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  label: { color: "#555" },
  value: { fontWeight: "bold" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#ccc", marginVertical: 8 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#999", paddingBottom: 2, marginTop: 3 },
  tableHeadFee: { flex: 3 },
  tableHeadAmt: { flex: 1, textAlign: "right" },
  tableRow: { flexDirection: "row", marginTop: 2 },
  tableFee: { flex: 3 },
  tableAmt: { flex: 1, textAlign: "right" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 10.5 },
  balanceLabel: { fontWeight: "bold" },
  accountsTitle: { fontSize: 8, fontWeight: "bold", marginTop: 10, color: "#555" },
  accountLine: { fontSize: 8, marginTop: 1, color: "#555" },
  footer: { marginTop: 18, fontSize: 7.5, color: "#888", textAlign: "center" },
});

function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  const currency = (n: number) => `${data.currency} ${Number(n || 0).toLocaleString()}`;
  const currentPaid = data.amount;
  const previously = data.previously_paid ?? null;
  const totalPaid = data.total_paid_at_issue ?? (previously === null ? currentPaid : previously + currentPaid);
  const expected = data.expected_at_issue;
  const parent = data.parent_label;

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          {data.logo_data_url ? <Image src={data.logo_data_url} style={styles.logo} /> : <Text style={styles.logoFallback}>S</Text>}
          <Text style={styles.schoolName}>{data.school_name}</Text>
          {data.school_motto ? <Text style={styles.schoolMotto}>{data.school_motto}</Text> : null}
          {data.school_address ? <Text style={styles.schoolAddress}>{data.school_address}</Text> : null}
          <Text style={styles.title}>OFFICIAL PAYMENT RECEIPT</Text>
          {data.term_label ? <Text style={styles.termLine}>Received for {data.term_label}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Receipt details</Text>
        <View style={styles.row}><Text style={styles.label}>Receipt No</Text><Text style={styles.value}>{data.receipt_number}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{new Date(data.paid_at).toLocaleDateString()}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Status</Text><Text style={styles.value}>PAID</Text></View>

        <Text style={styles.sectionTitle}>Student</Text>
        <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{data.student_name}</Text></View>
        {data.gender ? <View style={styles.row}><Text style={styles.label}>Gender</Text><Text style={styles.value}>{data.gender}</Text></View> : null}
        {data.class_name ? <View style={styles.row}><Text style={styles.label}>Class</Text><Text style={styles.value}>{data.class_name}</Text></View> : null}
        {parent ? <View style={styles.row}><Text style={styles.label}>Parent / Guardian</Text><Text style={styles.value}>{parent}</Text></View> : null}

        <Text style={styles.sectionTitle}>Payment details</Text>
        <View style={styles.row}><Text style={styles.label}>Amount Received</Text><Text style={styles.value}>{currency(currentPaid)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Method</Text><Text style={styles.value}>{data.method}</Text></View>
        {data.paid_into ? <View style={styles.row}><Text style={styles.label}>Paid Into</Text><Text style={styles.value}>{data.paid_into}</Text></View> : null}
        {data.reference ? <View style={styles.row}><Text style={styles.label}>Reference</Text><Text style={styles.value}>{data.reference}</Text></View> : null}

        {data.breakdown && data.breakdown.length > 0 ? (
          <>
            <View style={styles.tableHead}>
              <Text style={styles.tableHeadFee}>Allocation</Text>
              <Text style={styles.tableHeadAmt}>Amount</Text>
            </View>
            {data.breakdown.map((b) => (
              <View key={b.fee} style={styles.tableRow}>
                <Text style={styles.tableFee}>{b.fee}</Text>
                <Text style={styles.tableAmt}>{currency(b.amount)}</Text>
              </View>
            ))}
            <View style={styles.tableRow}>
              <Text style={[styles.tableFee, { fontWeight: "bold" }]}>Total — current payment</Text>
              <Text style={[styles.tableAmt, { fontWeight: "bold" }]}>{currency(currentPaid)}</Text>
            </View>
          </>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Term summary</Text>
        {previously !== null && previously > 0 ? (
          <>
            <View style={styles.row}><Text style={styles.label}>Previously Paid</Text><Text style={styles.value}>{currency(previously)}</Text></View>
            {data.previous_receipt_number ? (
              <View style={styles.row}><Text style={styles.label}>Previous Receipt</Text><Text style={styles.value}>{data.previous_receipt_number}</Text></View>
            ) : null}
          </>
        ) : null}
        <View style={styles.row}><Text style={styles.label}>Current Payment</Text><Text style={styles.value}>{currency(currentPaid)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Total Paid This Term</Text><Text style={styles.value}>{currency(totalPaid)}</Text></View>
        {expected !== null && expected !== undefined ? (
          <View style={styles.row}><Text style={styles.label}>Total Expected</Text><Text style={styles.value}>{currency(expected)}</Text></View>
        ) : null}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Balance Remaining</Text>
          <Text style={styles.balanceLabel}>{currency(data.balance_after)}</Text>
        </View>

        {data.accounts && data.accounts.length > 0 ? (
          <>
            <Text style={styles.accountsTitle}>Payments can also be made into:</Text>
            {data.accounts.map((a) => (
              <Text key={`${a.bank_name}-${a.account_number}`} style={styles.accountLine}>
                {a.bank_name} · {a.account_name} · {a.account_number}
              </Text>
            ))}
          </>
        ) : null}

        <Text style={styles.footer}>This receipt was generated by SchoolAid Finance. Please keep it for your records.</Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument data={data} />);
}
