import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";

/**
 * GET /api/school-admin/cbt/status → `{ enabled }`
 *
 * A tiny entitlement probe for the school-admin navigation. The full overview
 * is expensive; the sidebar only needs to know whether to show the CBT tab.
 * Fails closed, like every other feature check.
 */
export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await readCbtEntitlement(getServiceClient(), school_id);
  return NextResponse.json({ enabled: entitlement.enabled });
}
