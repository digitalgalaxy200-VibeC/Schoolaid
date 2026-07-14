import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

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

  // Previously the raw request body was passed straight into .update(),
  // which meant a school_admin could set any column on their school's row
  // by including it in the JSON body — including is_active (used to
  // suspend/archive a school) or slug (used for routing/lookup), neither of
  // which the settings UI exposes for editing. Only these fields, which the
  // profile page actually edits, are now accepted. See
  // docs/CORRECTIONS_SECURITE.md.
  const EDITABLE_FIELDS = ["name", "address", "phone", "email", "logo_url"] as const;
  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("schools").update(update).eq("id", school_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
