import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { pickWritableSchoolFields } from "@/lib/school-fields";

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

  // Only the columns in `SCHOOL_ADMIN_WRITABLE` survive this — see
  // `src/lib/school-fields.ts` for why it is a projection and not a rejection.
  const updates = pickWritableSchoolFields(body);
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
