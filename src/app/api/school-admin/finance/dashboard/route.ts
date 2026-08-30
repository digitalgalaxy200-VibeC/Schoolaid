import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type FeeRow = {
  amount: number | null;
  discount_amount: number | null;
  is_paid: boolean;
};

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const { data: studentFees, error } = await supabase
    .from("student_fees")
    .select("amount, discount_amount, is_paid")
    .eq("school_id", school_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fees = (studentFees || []) as FeeRow[];

  const totalCharged = fees.reduce((s: number, f: FeeRow) => s + (Number(f.amount) || 0), 0);
  const totalDiscounts = fees.reduce((s: number, f: FeeRow) => s + (Number(f.discount_amount) || 0), 0);
  // "Paid" = net of fees fully paid via their is_paid flag
  const paid = fees
    .filter((f: FeeRow) => f.is_paid)
    .reduce((s: number, f: FeeRow) => s + ((Number(f.amount) || 0) - (Number(f.discount_amount) || 0)), 0);

  const netTotal = totalCharged - totalDiscounts;
  const outstanding = Math.max(0, round2(netTotal - paid));
  // Guard against divide-by-zero when everything is discounted (would otherwise show Infinity%)
  const collectionRate = netTotal > 0 ? Math.round((paid / netTotal) * 100) : 0;

  return NextResponse.json({
    totalCharged: `₦${round2(totalCharged).toLocaleString()}`,
    totalCollected: `₦${round2(paid).toLocaleString()}`,
    outstanding: `₦${outstanding.toLocaleString()}`,
    collectionRate,
  });
}
