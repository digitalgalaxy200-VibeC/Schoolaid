import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const supabase = getServiceClient();
  let query = supabase.from("academic_terms").select("*").eq("school_id", school_id).order("start_date");
  if (sessionId) query = query.eq("academic_session_id", sessionId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();

  // If marking active, deactivate all other terms first
  if (body.is_active) {
    await supabase.from("academic_terms").update({ is_active: false }).eq("school_id", school_id).neq("id", "placeholder");
  }

  const { data, error } = await supabase.from("academic_terms").insert({ ...body, school_id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
