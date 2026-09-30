import { getServiceClient } from "@/lib/supabase/service";
import { loadFeeConfig, round2 } from "@/lib/finance/billing";
import type { RecalcInputs } from "@/lib/finance/recalc";

// Shared loader for the recalculation engine: pulls every record the pure
// planner needs for one school + term. School-scoped by construction.

type Supabase = ReturnType<typeof getServiceClient>;

export async function loadRecalcInputs(supabase: Supabase, school_id: string, termId: string): Promise<RecalcInputs> {
  const { data: bills } = await supabase
    .from("student_bills")
    .select("id, student_id, class_id, gross_amount, waiver_amount, net_amount, status")
    .eq("school_id", school_id)
    .eq("term_id", termId);

  const billRows = (bills || []) as {
    id: string;
    student_id: string;
    class_id: string | null;
    gross_amount: number;
    waiver_amount: number;
    net_amount: number;
    status: string;
  }[];

  const billIds = billRows.map((b) => b.id);
  const studentIds = billRows.map((b) => b.student_id);
  const classIds = billRows.filter((b) => b.class_id).map((b) => b.class_id as string);

  const [linesRes, allocRes, creditsRes, studentsRes, classesRes, config] = await Promise.all([
    billIds.length > 0
      ? supabase
          .from("student_bill_lines")
          .select("id, bill_id, fee_head_id, amount, waived_amount, is_compulsory")
          .eq("school_id", school_id)
          .in("bill_id", billIds)
      : Promise.resolve({ data: [] }),
    // Allocations for the whole school are cheap at this scale; bill-line scope
    // is applied below against the lines actually fetched. Rows already fully
    // converted to credit are excluded — they no longer count as payment.
    supabase
      .from("fee_allocations")
      .select("id, bill_line_id, payment_id, amount, converted_to_credit, payments(status)")
      .eq("school_id", school_id),
    // Credits already born from an allocation reduce that allocation's remaining
    // "payment weight" — keeps recalculation idempotent after partial conversions.
    supabase
      .from("credits")
      .select("source_allocation_id, amount")
      .eq("school_id", school_id)
      .not("source_allocation_id", "is", null),
    studentIds.length > 0
      ? supabase.from("students").select("id, first_name, last_name").eq("school_id", school_id).in("id", studentIds)
      : Promise.resolve({ data: [] }),
    classIds.length > 0
      ? supabase.from("classes").select("id, name").eq("school_id", school_id).in("id", classIds)
      : Promise.resolve({ data: [] }),
    loadFeeConfig(supabase, school_id),
  ]);

  const lineRows = (linesRes.data || []) as {
    id: string;
    bill_id: string;
    fee_head_id: string;
    amount: number;
    waived_amount: number;
  }[];

  const creditedByAlloc = new Map<string, number>();
  for (const c of (creditsRes.data || []) as { source_allocation_id: string; amount: number }[]) {
    creditedByAlloc.set(c.source_allocation_id, round2((creditedByAlloc.get(c.source_allocation_id) || 0) + Number(c.amount)));
  }

  const lineIdSet = new Set(lineRows.map((l) => l.id));
  const allocRows = ((allocRes.data || []) as {
    id: string;
    bill_line_id: string;
    payment_id: string;
    amount: number;
    converted_to_credit: boolean | null;
    payments: { status: string } | { status: string }[] | null;
  }[])
    .filter((a) => a.converted_to_credit !== true)
    .filter((a) => lineIdSet.has(a.bill_line_id))
    .filter((a) => {
      const raw = a.payments as { status: string } | { status: string }[] | null;
      const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
      return st === "active";
    })
    .map((a) => {
      // Effective payment weight = original allocation minus any credit already
      // born from it (partial conversions stay unflagged and keep counting).
      const credited = round2(creditedByAlloc.get(a.id) || 0);
      const effective = round2(Number(a.amount) - credited);
      return { id: a.id, bill_line_id: a.bill_line_id, payment_id: a.payment_id, amount: effective };
    })
    .filter((a) => a.amount > 0);

  const students = new Map<string, string>();
  for (const s of (studentsRes.data || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    students.set(s.id, `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Unknown");
  }

  const classes = new Map<string, string>();
  for (const c of (classesRes.data || []) as { id: string; name: string }[]) classes.set(c.id, c.name);

  return {
    termId,
    bills: billRows,
    lines: lineRows,
    allocs: allocRows,
    students,
    classes,
    config,
  };
}
