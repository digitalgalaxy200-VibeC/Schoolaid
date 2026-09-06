import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { CURRENCY_OPTIONS, currencyDef } from "@/lib/finance/currency";

// Phase 3 (FIN-002) — the school's finance currency.
//   GET /finance/currency
// Returns the stored code (default NGN) plus the supported picker options so
// screens and the School Profile settings never hardcode a list.

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("schools").select("currency").eq("id", school_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const code = currencyDef((data as { currency?: string | null } | null)?.currency).code;
  return NextResponse.json({
    code,
    options: CURRENCY_OPTIONS.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, after: !!c.after })),
  });
}
