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
      .eq("school_id", school_id)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep the session flag aligned with the term that is actually active,
    // otherwise "active session" and "active term" point at different sessions.
    if (data?.session_id) {
      const { error: sessErr } = await supabase
        .from("academic_sessions")
        .update({ is_active: false })
        .eq("school_id", school_id);
      if (sessErr) console.error("[terms] session deactivate failed:", sessErr.message);
      const { error: sessErr2 } = await supabase
        .from("academic_sessions")
        .update({ is_active: true })
        .eq("id", data.session_id)
        .eq("school_id", school_id);
      if (sessErr2) console.error("[terms] session activate failed:", sessErr2.message);
    }

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

  // The table requires dates (NOT NULL). The quick "Add Term" form only
  // collects a name, so fall back to the parent session's dates, then today.
  let startDate: string | null = body.start_date || null;
  let endDate: string | null = body.end_date || null;
  if (!startDate || !endDate) {
    let sessionStart: string | null = null;
    let sessionEnd: string | null = null;
    if (sessionId) {
      const { data: session } = await supabase
        .from("academic_sessions")
        .select("start_date, end_date")
        .eq("id", sessionId)
        .eq("school_id", school_id)
        .maybeSingle();
      sessionStart = session?.start_date || null;
      sessionEnd = session?.end_date || null;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!startDate) startDate = sessionStart || today;
    if (!endDate) endDate = sessionEnd || startDate;
  }

  const insert = {
    school_id,
    name: body.name,
    start_date: startDate,
    end_date: endDate,
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
  // Dates are NOT NULL on this table — an empty value must not clear them.
  if (updates.start_date === null || updates.start_date === "") delete updates.start_date;
  if (updates.end_date === null || updates.end_date === "") delete updates.end_date;
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
