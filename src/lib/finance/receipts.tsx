// ============================================================================
// Finance — receipts: numbering + PDF generation (Phase 5)
// Numbering: {SCHOOL-CODE}-{YEAR}-{SEQUENCE}  e.g. SCH-IXBYKV8D-2026-0001
//   • School-specific prefix → cannot collide across schools
//   • Legacy numbers (RCP-...) use a different prefix → never collide
//   • The generator checks BOTH payments and receipts (the global UNIQUE on
//     payments.receipt_number + per-school UNIQUE on receipts both hold)
// PDF: built with @react-pdf/renderer (already a project dependency)
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// ── Receipt number generation ────────────────────────────────────────────────

export async function generateReceiptNumber(
  supabase: SupabaseClient,
  school_id: string,
): Promise<string> {
  const { data: school } = await supabase
    .from("schools")
    .select("code, slug")
    .eq("id", school_id)
    .maybeSingle();

  const prefixCode = school?.code || school?.slug?.toUpperCase().slice(0, 12) || "SCH";
  const clean = String(prefixCode).replace(/[^A-Z0-9-]/gi, "").slice(0, 12);
  const year = new Date().getFullYear();
  const prefix = `${clean}-${year}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Count existing numbers with this prefix across both tables
    const [{ data: payCount }, { data: recCount }] = await Promise.all([
      supabase.from("payments").select("id").like("receipt_number", `${prefix}%`),
      supabase.from("receipts").select("id").like("receipt_number", `${prefix}%`),
    ]);
    const seq = (payCount?.length || 0) + (recCount?.length || 0) + 1;
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;

    // Double-check the candidate is free in both tables
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("payments").select("id").eq("receipt_number", candidate).maybeSingle(),
      supabase.from("receipts").select("id").eq("receipt_number", candidate).maybeSingle(),
    ]);
    if (!p && !r) return candidate;
  }
  // Extremely unlikely fallback (uniqueness constraints would still catch races)
  return `${prefix}${Date.now()}`;
}

// ── Receipt PDF ──────────────────────────────────────────────────────────────

type ReceiptPdfData = {
  school_name: string;
  school_address: string | null;
  receipt_number: string;
  student_name: string;
  class_name: string | null;
  term_name: string | null;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
  balance_after: number;
  recorded_by: string | null;
  currency: string;
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  schoolName: { fontSize: 16, fontWeight: "bold", textAlign: "center" },
  schoolAddress: { fontSize: 9, textAlign: "center", marginTop: 2, color: "#555" },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginTop: 14, letterSpacing: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  label: { color: "#555" },
  value: { fontWeight: "bold" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#ccc", marginVertical: 10 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, fontSize: 11 },
  balanceLabel: { fontWeight: "bold" },
  footer: { marginTop: 24, fontSize: 8, color: "#888", textAlign: "center" },
});

function ReceiptDocument({ data }: { data: ReceiptPdfData }) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.school_name}</Text>
          {data.school_address ? <Text style={styles.schoolAddress}>{data.school_address}</Text> : null}
          <Text style={styles.title}>OFFICIAL PAYMENT RECEIPT</Text>
        </View>

        <View style={styles.row}><Text style={styles.label}>Receipt No</Text><Text style={styles.value}>{data.receipt_number}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Student</Text><Text style={styles.value}>{data.student_name}</Text></View>
        {data.class_name ? <View style={styles.row}><Text style={styles.label}>Class</Text><Text style={styles.value}>{data.class_name}</Text></View> : null}
        {data.term_name ? <View style={styles.row}><Text style={styles.label}>Term</Text><Text style={styles.value}>{data.term_name}</Text></View> : null}
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.label}>Amount Paid</Text><Text style={styles.value}>{data.currency} {data.amount.toLocaleString()}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Payment Method</Text><Text style={styles.value}>{data.method}</Text></View>
        {data.reference ? <View style={styles.row}><Text style={styles.label}>Reference</Text><Text style={styles.value}>{data.reference}</Text></View> : null}
        <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{new Date(data.paid_at).toLocaleDateString()}</Text></View>
        {data.recorded_by ? <View style={styles.row}><Text style={styles.label}>Recorded By</Text><Text style={styles.value}>{data.recorded_by}</Text></View> : null}
        <View style={styles.divider} />
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Balance After Payment</Text>
          <Text style={styles.balanceLabel}>{data.currency} {data.balance_after.toLocaleString()}</Text>
        </View>
        <Text style={styles.footer}>This receipt was generated by SchoolAid Finance. Please keep it for your records.</Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument data={data} />);
}
