import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const supabase = getServiceClient();
  let query = supabase
    .from("academic_terms")
    .select("*")
    .eq("school_id", school_id)
    .order("start_date");
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();

  if (body.is_active) {
    await supabase
      .from("academic_terms")
      .update({ is_active: false })
      .eq("school_id", school_id);
    const { data, error } = await supabase
      .from("academic_terms")
      .update({ is_active: true })
      .eq("id", body.id)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Map session_id from request (supports both column names)
  const sessionId = body.session_id || body.academic_session_id;
  const { data: existing } = await supabase
    .from("academic_terms")
    .select("id")
    .eq("school_id", school_id)
    .eq("session_id", sessionId)
    .eq("name", body.name)
    .maybeSingle();
  if (existing)
    return NextResponse.json(
      { error: `A term named "${body.name}" already exists in this session.` },
      { status: 409 },
    );

  const insert = {
    school_id,
    name: body.name,
    start_date: body.start_date,
    end_date: body.end_date,
    session_id: sessionId,
  };
  const { data, error } = await supabase
    .from("academic_terms")
    .insert(insert)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("academic_terms")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
