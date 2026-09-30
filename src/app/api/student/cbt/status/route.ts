import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/student/cbt/status → `{ enabled }`
 *
 * The student equivalent of `/api/teacher/cbt/status`: what the student
 * navigation needs in order to know whether to show "Tests" at all. Same
 * reasoning — its own endpoint rather than a field on the shared `/api/auth/me`.
 *
 * FAILS CLOSED: an entitlement read that errors reports `enabled: false`.
 */

export async function GET() {
  const { authorized, school_id } = await verifyStudent();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await readCbtEntitlement(getServiceClient(), school_id);

  return NextResponse.json({ enabled: entitlement.enabled });
}
