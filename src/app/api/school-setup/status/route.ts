import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { buildSetupReport } from "@/lib/school-setup/status";

/**
 * GET /api/school-setup/status
 *
 * The setup picture for ONE school: the school that owns this session.
 *
 * TWO GATES, DELIBERATELY
 * -----------------------
 * 1. A school session is required, so there is no way to ask about a school you
 *    are not in — the id comes from the verified session, never the request.
 * 2. `impersonated` must be true: this is a platform-operator view. A school's
 *    own administrator is refused, matching the navigation, which only shows
 *    the entry while a Super Admin is impersonating.
 *
 * The report is READ-ONLY. Nothing here writes, and no checklist state is
 * stored — every figure is derived from the school's existing records.
 */
export async function GET() {
  const { authorized, school_id, impersonated } = await verifySchoolAdmin();

  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!impersonated) {
    return NextResponse.json(
      { error: "School Setup is available to platform administrators only." },
      { status: 403 },
    );
  }

  try {
    const report = await buildSetupReport(getServiceClient(), school_id);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[school-setup] status failed:", err);
    return NextResponse.json(
      { error: "Could not read this school's setup status." },
      { status: 500 },
    );
  }
}
