import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadRunHistory } from "@/lib/promotion/service";

/** GET /api/school-admin/promotion/history — the 20 most recent runs. */
export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();
    const runs = await loadRunHistory(supabase, school_id);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load promotion history." },
      { status: 500 },
    );
  }
}
