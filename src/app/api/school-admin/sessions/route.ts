import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("*")
    .eq("school_id", school_id)
    .order("start_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();

  // Duplicate name check
  const { data: existing } = await supabase
    .from("academic_sessions")
    .select("id")
    .eq("school_id", school_id)
    .eq("name", body.name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `A session named "${body.name}" already exists.` }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("academic_sessions")
    .insert({ ...body, school_id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("academic_sessions")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
