import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadPreview } from "@/lib/promotion/service";

/**
 * GET /api/school-admin/promotion/preview
 *
 * Read-only. Returns the reviewable plan for the SAVED mappings: per source
 * class, the destination, the eligible students, the graduating students, and
 * the students that need administrator attention.
 */
export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();
    const preview = await loadPreview(supabase, school_id);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the promotion preview." },
      { status: 500 },
    );
  }
}
