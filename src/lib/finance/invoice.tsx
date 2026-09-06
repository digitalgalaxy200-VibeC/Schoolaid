// ============================================================================
// Finance — invoice PDF (what the student is EXPECTED to pay)
// Distinct from a receipt (money actually received). Status is derived.
// ============================================================================

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type InvoiceLine = { fee: string; amount: number };

export type InvoicePdfData = {
  school_name: string;
  school_motto?: string | null;
  school_address?: string | null;
  school_contacts?: string | null;
  term_label?: string | null;
  invoice_label?: string; // e.g. "FEE INVOICE — SECOND TERM"
  student_name: string;
  class_name?: string | null;
  lines: InvoiceLine[];
  gross: number;
  waiver: number;
  net: number;
  paid: number;
  applied_credit: number;
  outstanding: number;
  status: string; // NOT PAID | PARTIALLY PAID | PAID
  currency: string;
};

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9.5, fontFamily: "Helvetica" },
  header: { marginBottom: 12, alignItems: "center" },
  schoolName: { fontSize: 15, fontWeight: "bold", textAlign: "center" },
  schoolMotto: { fontSize: 8.5, textAlign: "center", marginTop: 2, color: "#555" },
  schoolAddress: { fontSize: 8, textAlign: "center", marginTop: 1, color: "#777" },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "center", marginTop: 10, letterSpacing: 1.5 },
  termLine: { fontSize: 8.5, textAlign: "center", marginTop: 2, color: "#444" },
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
  balanceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, fontSize: 11 },
  balanceLabel: { fontWeight: "bold" },
  footer: { marginTop: 20, fontSize: 7.5, color: "#888", textAlign: "center" },
});

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const currency = (n: number) => `${data.currency} ${Number(n || 0).toLocaleString()}`;

  const doc = (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.school_name}</Text>
          {data.school_motto ? <Text style={styles.schoolMotto}>{data.school_motto}</Text> : null}
          {data.school_address ? <Text style={styles.schoolAddress}>{data.school_address}</Text> : null}
          <Text style={styles.title}>FEE INVOICE</Text>
          {data.term_label ? <Text style={styles.termLine}>{data.term_label}</Text> : null}
        </View>

        <View style={styles.row}><Text style={styles.label}>Student</Text><Text style={styles.value}>{data.student_name}</Text></View>
        {data.class_name ? <View style={styles.row}><Text style={styles.label}>Class</Text><Text style={styles.value}>{data.class_name}</Text></View> : null}
        <View style={styles.row}><Text style={styles.label}>Status</Text><Text style={styles.value}>{data.status}</Text></View>
        <View style={styles.divider} />

        <View style={styles.tableHead}>
          <Text style={styles.tableHeadFee}>Fee</Text>
          <Text style={styles.tableHeadAmt}>Amount</Text>
        </View>
        {data.lines.map((l) => (
          <View key={l.fee} style={styles.tableRow}>
            <Text style={styles.tableFee}>{l.fee}</Text>
            <Text style={styles.tableAmt}>{currency(l.amount)}</Text>
          </View>
        ))}
        <View style={styles.tableRow}>
          <Text style={[styles.tableFee, { fontWeight: "bold" }]}>Gross</Text>
          <Text style={[styles.tableAmt, { fontWeight: "bold" }]}>{currency(data.gross)}</Text>
        </View>
        {data.waiver > 0 ? (
          <View style={styles.tableRow}>
            <Text style={[styles.tableFee, { color: "#B45309" }]}>Waivers / discounts</Text>
            <Text style={[styles.tableAmt, { color: "#B45309" }]}>−{currency(data.waiver)}</Text>
          </View>
        ) : null}
        <View style={styles.tableRow}>
          <Text style={[styles.tableFee, { fontWeight: "bold", fontSize: 10.5 }]}>Total Expected</Text>
          <Text style={[styles.tableAmt, { fontWeight: "bold", fontSize: 10.5 }]}>{currency(data.net)}</Text>
        </View>

        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.label}>Paid</Text><Text style={styles.value}>{currency(data.paid)}</Text></View>
        {data.applied_credit > 0 ? <View style={styles.row}><Text style={styles.label}>Credit Applied</Text><Text style={styles.value}>−{currency(data.applied_credit)}</Text></View> : null}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Balance Due</Text>
          <Text style={styles.balanceLabel}>{currency(data.outstanding)}</Text>
        </View>

        <Text style={styles.footer}>This invoice states what is expected for the term. Payments are confirmed by their own receipts. Generated by SchoolAid Finance.</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
