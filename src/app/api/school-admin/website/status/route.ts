import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { readWebsiteEntitlement } from "@/lib/site/entitlement";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/school-admin/website/status → `{ enabled }`
 *
 * The one thing the school-admin navigation needs in order to know whether to
 * show the Website section at all. It is deliberately its own endpoint rather
 * than a field on `/api/auth/me`: that route is consulted on every page by
 * every role (the assistant launcher re-fetches it on each navigation), and
 * adding a tenant-feature query there would tax the whole platform to answer a
 * question only school admins ask.
 *
 * FAILS CLOSED: an entitlement read that errors reports `enabled: false`, so a
 * database problem hides a menu item rather than showing one that will not work.
 */

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const entitlement = await readWebsiteEntitlement(supabase, school_id);

  return NextResponse.json({ enabled: entitlement.enabled });
}
