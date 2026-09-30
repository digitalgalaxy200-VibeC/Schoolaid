import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/teacher/cbt/status → `{ enabled }`
 *
 * The one thing the teacher navigation needs in order to know whether to show
 * the CBT entries at all. Deliberately its own endpoint rather than a field on
 * `/api/auth/me`, which every role consults on every navigation — adding a
 * tenant-feature query there would tax the whole platform to answer a question
 * only teachers ask.
 *
 * FAILS CLOSED: an entitlement read that errors reports `enabled: false`, so a
 * database problem hides a menu item rather than showing one that will not work.
 */

export async function GET() {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await readCbtEntitlement(getServiceClient(), school_id);

  return NextResponse.json({ enabled: entitlement.enabled });
}
