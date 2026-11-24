import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { dateRangeError } from "@/lib/academic/term-span";
import { pickCurrentTerm, schoolTodayISO } from "@/lib/school-admin/term";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();

  // Fetch sessions
  const { data: sessions, error } = await supabase
    .from("academic_sessions")
    .select("*")
    .eq("school_id", school_id)
    .order("start_date", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch all terms for this school
  const { data: allTerms } = await supabase
    .from("academic_terms")
    .select("*")
    .eq("school_id", school_id)
    .order("start_date");

  // Map terms to their sessions
  const result = (sessions || []).map((s: any) => {
    const terms = (allTerms || []).filter(
      (t: any) => t.session_id === s.id || t.academic_session_id === s.id,
    );
    return { ...s, terms };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("academic_sessions")
    .select("id")
    .eq("school_id", school_id)
    .eq("name", body.name)
    .maybeSingle();
  if (existing)
    return NextResponse.json(
      { error: `A session named "${body.name}" already exists.` },
      { status: 409 },
    );

  // Dates are NOT NULL on this table; default them when the form omits them.
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const insert = {
    ...body,
    school_id,
    start_date: body.start_date || today,
    end_date: body.end_date || defaultEnd,
  };

  // A session that ends before it starts is a typo, not a plan.
  const rangeError = dateRangeError(insert.start_date, insert.end_date);
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

  const { data, error } = await supabase
    .from("academic_sessions")
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

  // Compare against the stored value for whichever half was not sent, so a
  // single-field edit can never create a backwards range.
  if (updates.start_date !== undefined || updates.end_date !== undefined) {
    const { data: current } = await supabase
      .from("academic_sessions")
      .select("start_date, end_date")
      .eq("id", id)
      .eq("school_id", school_id)
      .maybeSingle();
    const rangeError = dateRangeError(
      updates.start_date ?? current?.start_date,
      updates.end_date ?? current?.end_date,
    );
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("academic_sessions")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Activation is all-or-nothing. The header resolves the current term from the
  // active SESSION while Finance resolves it from the active TERM, so a session
  // marked active whose terms had all finished made the two screens disagree
  // (the header said "Second Term (ended)" while Finance was in the new First
  // Term). Activating a session now also activates its current term, mirroring
  // what activating a term already does to its session.
  if (updates.is_active === true) {
    await supabase.from("academic_sessions").update({ is_active: false }).eq("school_id", school_id).neq("id", id);
    await supabase.from("academic_terms").update({ is_active: false }).eq("school_id", school_id);
    const { data: sessionTerms } = await supabase
      .from("academic_terms")
      .select("id, name, start_date, end_date, is_active")
      .eq("school_id", school_id)
      .eq("session_id", id)
      .order("start_date");
    const current = pickCurrentTerm(sessionTerms || [], schoolTodayISO());
    if (current) {
      await supabase.from("academic_terms").update({ is_active: true }).eq("id", current.id).eq("school_id", school_id);
    }
  }

  return NextResponse.json(data);
}
