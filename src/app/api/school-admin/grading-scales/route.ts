import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const supabase = getServiceClient();
  let query = supabase
    .from("grading_scales")
    .select("*")
    .eq("school_id", school_id)
    .order("minimum_score", { ascending: false });
  if (classId) query = query.or(`class_id.eq.${classId},class_id.is.null`);
  else query = query.is("class_id", null);
  const { data } = await query;
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("grading_scales")
    .insert({ ...body, school_id })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...body } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("grading_scales")
    .update(body)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  await supabase
    .from("grading_scales")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);
  return NextResponse.json({ success: true });
}
