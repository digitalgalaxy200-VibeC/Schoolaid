import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// GET /api/school-admin/class-subjects?class_id=xxx&subject_id=xxx
export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const subjectId = searchParams.get("subject_id");

  let query = supabase
    .from("class_subjects")
    .select("*, subjects(id, name, code), classes(id, name, grade_level)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (classId) query = query.eq("class_id", classId);
  if (subjectId) query = query.eq("subject_id", subjectId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST /api/school-admin/class-subjects
// Body: { subject_id, class_ids: string[] }  — bulk assign one subject to many classes
// OR:   { subject_id, class_id }             — single assignment
export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json();
  const { subject_id, class_id, class_ids } = body;

  if (!subject_id) {
    return NextResponse.json({ error: "subject_id is required" }, { status: 400 });
  }

  // Build list of class IDs to assign
  const targetClasses: string[] = class_ids?.length
    ? class_ids
    : class_id
    ? [class_id]
    : [];

  if (targetClasses.length === 0) {
    return NextResponse.json({ error: "class_id or class_ids required" }, { status: 400 });
  }

  const rows = targetClasses.map((cid: string) => ({
    school_id,
    subject_id,
    class_id: cid,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("class_subjects")
    .upsert(rows, { onConflict: "school_id,class_id,subject_id" })
    .select("*, subjects(name, code), classes(name, grade_level)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/school-admin/class-subjects?id=xxx
export async function DELETE(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("class_subjects")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
