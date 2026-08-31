import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2, isPostedPayment } from "@/lib/finance/reports";
import * as XLSX from "xlsx";

// Phase 5 — report export (Excel/XLSX). Respects the same filters as the
// reports API and is strictly school-scoped.
//   GET /finance/reports/export?type=outstanding|payments|fees&term_id=&method=&status=&date_from=&date_to=

type StudentJoin = { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
type PaymentExportRow = { id: string; student_id: string; amount: number; method: string | null; reference: string | null; receipt_number: string | null; paid_at: string; status: string; students: StudentJoin };
type BillExportRow = { id: string; net_amount: number; term_id: string; student_id: string; students: StudentJoin; classes: { id: string; name: string } | { id: string; name: string }[] | null };
type LineExportRow = { id: string; bill_id: string; fee_head_id: string; amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null };
type AllocExportRow = { amount: number; bill_line_id: string; payments: { status: string } | { status: string }[] | null };

const studentName = (join: StudentJoin): string => {
  const s = Array.isArray(join) ? join[0] : join;
  return s ? `${s.first_name || ""} ${s.last_name || ""}`.trim() : "Unknown";
};

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "outstanding";
  const termId = searchParams.get("term_id");
  const method = searchParams.get("method");
  const status = searchParams.get("status");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const supabase = getServiceClient();

  let rows: Record<string, unknown>[] = [];
  let sheetName = "Report";

  if (type === "payments") {
    let q = supabase
      .from("payments")
      .select("id, student_id, amount, method, reference, receipt_number, paid_at, status, students(first_name, last_name)")
      .eq("school_id", school_id)
      .order("paid_at", { ascending: false });
    if (termId) q = q.eq("term_id", termId);
    if (method) q = q.eq("method", method);
    if (status) q = q.eq("status", status);
    if (dateFrom) q = q.gte("paid_at", dateFrom);
    if (dateTo) q = q.lte("paid_at", dateTo);
    const { data } = await q;
    rows = ((data || []) as PaymentExportRow[]).map((p) => ({
      Date: p.paid_at?.slice(0, 10),
      Student: studentName(p.students),
      Amount: Number(p.amount),
      Method: p.method,
      Reference: p.reference || "",
      "Receipt No": p.receipt_number || "",
      Status: p.status,
    }));
    sheetName = "Payments";
  } else {
    // Shared bill-based reports (outstanding / fees)
    let billsQuery = supabase
      .from("student_bills")
      .select("id, net_amount, term_id, student_id, students(first_name, last_name), classes(id, name)")
      .eq("school_id", school_id);
    if (termId) billsQuery = billsQuery.eq("term_id", termId);
    const { data: bills } = await billsQuery;
    const billRows = (bills || []) as BillExportRow[];

    const billIds = billRows.map((b) => b.id);
    const { data: lines } = billIds.length
      ? await supabase.from("student_bill_lines").select("id, bill_id, fee_head_id, amount, fee_heads(id, name)").in("bill_id", billIds)
      : { data: [] };
    const lineRows = (lines || []) as LineExportRow[];
    const lineIds = lineRows.map((l) => l.id);
    const { data: allocs } = lineIds.length
      ? await supabase.from("fee_allocations").select("amount, bill_line_id, payments(status)").eq("school_id", school_id).in("bill_line_id", lineIds)
      : { data: [] };

    const paidByBill = new Map<string, number>();
    const paidByLine = new Map<string, number>();
    for (const a of (allocs || []) as AllocExportRow[]) {
      if (!isPostedPayment(a.payments)) continue;
      const billId = lineRows.find((l) => l.id === a.bill_line_id)?.bill_id;
      paidByLine.set(a.bill_line_id, (paidByLine.get(a.bill_line_id) || 0) + Number(a.amount));
      if (billId) paidByBill.set(billId, (paidByBill.get(billId) || 0) + Number(a.amount));
    }

    if (type === "fees") {
      const feeMap = new Map<string, { fee: string; expected: number; collected: number }>();
      for (const l of lineRows) {
        const rawFh = l.fee_heads as { id: string; name: string } | { id: string; name: string }[] | null;
        const fh = Array.isArray(rawFh) ? rawFh[0] : rawFh;
        const key = l.fee_head_id;
        const cur = feeMap.get(key) || { fee: fh?.name || "Fee", expected: 0, collected: 0 };
        const amount = Number(l.amount);
        cur.expected = round2(cur.expected + amount);
        cur.collected = round2(cur.collected + Math.min(amount, paidByLine.get(l.id) || 0));
        feeMap.set(key, cur);
      }
      rows = Array.from(feeMap.values()).map((f) => ({
        Fee: f.fee,
        Expected: f.expected,
        Collected: f.collected,
        Outstanding: round2(Math.max(0, f.expected - f.collected)),
      }));
      sheetName = "Fee Breakdown";
    } else {
      rows = billRows
        .map((b) => {
          const paid = paidByBill.get(b.id) || 0;
          const net = round2(Number(b.net_amount));
          const cls = Array.isArray(b.classes) ? b.classes[0] : b.classes;
          return {
            Student: studentName(b.students),
            Class: cls?.name || "",
            Expected: net,
            Paid: round2(paid),
            Outstanding: round2(Math.max(0, net - paid)),
          };
        })
        .filter((r) => (r.Outstanding as number) > 0);
      sheetName = "Outstanding";
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="schoolaid-${type}-report.xlsx"`,
    },
  });
}
