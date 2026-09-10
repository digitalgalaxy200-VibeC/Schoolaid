import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { renderReceiptPdf } from "@/lib/finance/receipts";

// Phase B — download a receipt as PDF (full school branding + term context).
// Numbers come from the receipt's issuance snapshots when present; legacy
// receipts fall back to a live calculation. Nothing here ever mutates records.

type StudentJoin = { first_name: string | null; last_name: string | null; gender: string | null; parent_name: string | null; parent_phone: string | null };
type SessionJoin = { id: string; name: string } | { id: string; name: string }[] | null;
const joinOne = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

async function fetchLogoDataUrl(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/png";
    if (buf.length > 1_500_000) return null; // keep PDFs light
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: receipt, error: recErr } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const { data: payment } = await supabase
    .from("payments")
    .select("*, students(first_name, last_name, gender, parent_name, parent_phone), academic_terms(id, name, academic_sessions(name))")
    .eq("id", receipt.payment_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!payment) return NextResponse.json({ error: "Payment not found for this receipt" }, { status: 404 });

  const { data: school } = await supabase
    .from("schools")
    .select("name, address, phone, email, motto, logo_url, currency, website")
    .eq("id", school_id)
    .maybeSingle();

  const { data: accounts } = await supabase
    .from("school_bank_accounts")
    .select("bank_name, account_name, account_number")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .order("display_order")
    .order("bank_name");

  // ── Allocation breakdown for THIS payment ──
  const { data: allocRows } = await supabase
    .from("fee_allocations")
    .select("amount, student_bill_lines(fee_head_id, fee_heads(id, name))")
    .eq("payment_id", receipt.payment_id);
  const breakdown = ((allocRows || []) as { amount: number; student_bill_lines: { fee_heads: { id: string; name: string } | { id: string; name: string }[] | null } | { fee_heads: { id: string; name: string } | { id: string; name: string }[] | null }[] | null }[])
    .map((a) => {
      const line = joinOne(a.student_bill_lines as { fee_heads: { id: string; name: string } | { id: string; name: string }[] | null } | { fee_heads: { id: string; name: string } | { id: string; name: string }[] | null }[] | null);
      const fh = joinOne(line?.fee_heads);
      return { fee: fh?.name || "Fee", amount: round2(Number(a.amount)) };
    })
    .filter((b) => b.amount > 0);

  // ── Student / term context ──
  const rawStudent = payment.students as StudentJoin | StudentJoin[] | null;
  const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
  const rawTerm = payment.academic_terms as { id: string; name: string; academic_sessions: SessionJoin } | { id: string; name: string; academic_sessions: SessionJoin }[] | null;
  const termRow = Array.isArray(rawTerm) ? rawTerm[0] : rawTerm;
  const session = joinOne(termRow?.academic_sessions ?? null);
  const termLabel = termRow ? `${termRow.name}${session ? ` · ${session.name} Session` : ""}` : null;
  const studentName = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown";
  const parentLabel =
    student && (student.parent_name || student.parent_phone)
      ? `${student.parent_name || ""}${student.parent_phone ? (student.parent_name ? ` · ${student.parent_phone}` : student.parent_phone) : ""}`.trim()
      : null;

  const { data: cls } = await supabase
    .from("students")
    .select("class_id, classes(name)")
    .eq("id", payment.student_id)
    .eq("school_id", school_id)
    .maybeSingle();
  const rawCls = cls?.classes as { name: string } | { name: string }[] | null;
  const className = cls ? joinOne(rawCls)?.name || null : null;

  // ── Term context numbers: SNAPSHOTS first, live fallback for legacy receipts ──
  const snap = receipt as {
    expected_at_issue: number | null;
    total_paid_at_issue: number | null;
    balance_after: number | null;
    previous_receipt_number: string | null;
  };

  let expected = snap.expected_at_issue !== null && snap.expected_at_issue !== undefined ? Number(snap.expected_at_issue) : null;
  let previouslyPaid: number | null = null;
  let balanceAfter: number | null = snap.balance_after !== null && snap.balance_after !== undefined ? Number(snap.balance_after) : null;

  // Live fallback (only for receipts issued before snapshots existed)
  if (expected === null || balanceAfter === null) {
    const { data: bill } = await supabase
      .from("student_bills")
      .select("net_amount")
      .eq("school_id", school_id)
      .eq("student_id", payment.student_id)
      .eq("term_id", payment.term_id)
      .maybeSingle();
    const billNet = bill ? round2(Number((bill as { net_amount: number }).net_amount)) : round2(Number(payment.amount));
    if (expected === null) expected = billNet;
    if (balanceAfter === null) balanceAfter = round2(Math.max(0, billNet - Number(payment.amount)));
  }

  // Previous payments before this one (for the cumulative block + previous receipt no.)
  const { data: earlier } = await supabase
    .from("payments")
    .select("amount, receipt_number")
    .eq("school_id", school_id)
    .eq("student_id", payment.student_id)
    .eq("term_id", payment.term_id)
    .eq("status", "active")
    .lt("paid_at", payment.paid_at as string)
    .order("paid_at", { ascending: false })
    .limit(50);
  const earlierRows = (earlier || []) as { amount: number; receipt_number: string | null }[];
  const earlierTotal = round2(earlierRows.reduce((s, p) => s + Number(p.amount), 0));
  if (snap.total_paid_at_issue === null || snap.total_paid_at_issue === undefined) {
    previouslyPaid = earlierTotal > 0 ? earlierTotal : null;
  } else {
    previouslyPaid = round2(Math.max(0, Number(snap.total_paid_at_issue) - Number(payment.amount)));
  }
  const previousReceiptNumber = snap.previous_receipt_number || earlierRows[0]?.receipt_number || null;
  const totalPaidAtIssue =
    snap.total_paid_at_issue !== null && snap.total_paid_at_issue !== undefined ? Number(snap.total_paid_at_issue) : round2(earlierTotal + Number(payment.amount));

  // Actor display (best-effort; school-scoped — receipts are school records)
  const { data: actorProfile } = payment.recorded_by
    ? await supabase.from("profiles").select("full_name").eq("id", payment.recorded_by).eq("school_id", school_id).maybeSingle()
    : { data: null };
  const recordedByName = (actorProfile as { full_name: string | null } | null)?.full_name || null;

  const logoDataUrl = await fetchLogoDataUrl((school as { logo_url: string | null } | null)?.logo_url ?? null);

  const buffer = await renderReceiptPdf({
    school_name: (school as { name: string } | null)?.name || "School",
    school_motto: (school as { motto: string | null } | null)?.motto,
    school_address: (school as { address: string | null } | null)?.address,
    school_contacts: [((school as { phone: string | null } | null)?.phone || null), ((school as { email: string | null } | null)?.email || null)]
      .filter(Boolean)
      .join(" · ") || null,
    school_website: (school as { website: string | null } | null)?.website || null,
    logo_data_url: logoDataUrl,
    receipt_number: receipt.receipt_number,
    term_label: termLabel,
    student_name: studentName,
    gender: student?.gender || null,
    class_name: className,
    parent_label: parentLabel,
    amount: Number(payment.amount),
    method: payment.method || "—",
    paid_into: payment.paid_into || null,
    sender_name: payment.sender_name || null,
    reference: payment.reference,
    paid_at: payment.paid_at,
    breakdown,
    previously_paid: previouslyPaid,
    previous_receipt_number: previousReceiptNumber,
    total_paid_at_issue: totalPaidAtIssue,
    expected_at_issue: expected,
    balance_after: balanceAfter ?? 0,
    accounts: (accounts || []) as { bank_name: string; account_name: string; account_number: string }[],
    recorded_by: recordedByName,
    currency: (school as { currency?: string | null } | null)?.currency || "NGN",
  });

  // ── Smart document name: "Amina John Doe - Second Term 2025-2026 Receipt.pdf" ──
  const safe = (s: string) => s.replace(/[\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const dashify = (s: string) => s.replace(/[\/:*?"<>|]+/g, "-").replace(/-+/g, "-").trim();
  const fileTerm = safe([termRow?.name || "", dashify(session?.name || "")].filter(Boolean).join(" "));
  const fileName = `${safe(studentName)} - ${fileTerm} Receipt.pdf`;

  // ?download=1 → attachment (browser saves the file); default inline (view)
  const download = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
