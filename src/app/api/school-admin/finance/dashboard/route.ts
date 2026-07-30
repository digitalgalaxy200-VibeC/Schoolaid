import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const { data: studentFees } = await supabase
    .from("student_fees")
    .select("amount, discount_amount, is_paid")
    .eq("school_id", school_id);

  const totalCharged = (studentFees || []).reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);
  const totalDiscounts = (studentFees || []).reduce((s: number, f: any) => s + (Number(f.discount_amount) || 0), 0);
  const paid = (studentFees || []).filter((f: any) => f.is_paid).reduce((s: number, f: any) => s + (Number(f.amount) - (Number(f.discount_amount) || 0)), 0);
  const outstanding = totalCharged - totalDiscounts - paid;
  const collectionRate = totalCharged > 0 ? Math.round((paid / (totalCharged - totalDiscounts)) * 100) : 0;

  return NextResponse.json({
    totalCharged: `₦${totalCharged.toLocaleString()}`,
    totalCollected: `₦${paid.toLocaleString()}`,
    outstanding: `₦${outstanding.toLocaleString()}`,
    collectionRate,
  });
}
