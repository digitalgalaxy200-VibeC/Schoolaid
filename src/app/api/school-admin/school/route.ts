import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * The columns a school administrator may change.
 *
 * WHY A PROJECTION RATHER THAN A REJECTION
 * ----------------------------------------
 * The profile screen loads the whole school row (`select("*")`) and PUTs the whole
 * object back, so a body containing `is_active` or `subscription_status` is
 * ordinary traffic from our own page, not an attack. Rejecting unknown keys with a
 * 400 would break that screen.
 *
 * Projecting onto this list achieves the actual goal — the write cannot touch any
 * column outside it — without changing what the UI is allowed to send. `slug` is
 * absent on purpose: it is in URLs, and a school renaming its own slug would break
 * links that already exist. The subscription and lifecycle columns are absent
 * because they are the platform's, not the school's.
 */
const SCHOOL_ADMIN_WRITABLE = [
  "name",
  "address",
  "phone",
  "email",
  "logo_url",
  "grading_scale",
  "motto",
  "website",
  "abbreviation",
  "currency",
] as const;

function pickWritable(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const source = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const key of SCHOOL_ADMIN_WRITABLE) {
    if (key in source) updates[key] = source[key];
  }
  return updates;
}

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("schools").select("*").eq("id", school_id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();

  const updates = pickWritable(body);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields were supplied" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("schools")
    .update(updates)
    .eq("id", school_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
