import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const supabase = getServiceClient();
  let query = supabase.from("grading_scales").select("*").eq("school_id", school_id).order("minimum_score", { ascending: false });
  if (classId) query = query.or(`class_id.eq.${classId},class_id.is.null`);
  else query = query.is("class_id", null);
  const { data } = await query;
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();

  // Validate no overlapping ranges
  if (body.minimum_score && body.maximum_score) {
    const { data: existing } = await supabase.from("grading_scales")
      .select("*").eq("school_id", school_id)
      .or(`class_id.eq.${body.class_id || "00000000-0000-0000-0000-000000000000"},class_id.is.null`)
      .lte("minimum_score", body.maximum_score).gte("maximum_score", body.minimum_score);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Grade range overlaps with existing grade" }, { status: 400 });
    }
  }

  const { data, error } = await supabase.from("grading_scales").insert({ ...body, school_id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
