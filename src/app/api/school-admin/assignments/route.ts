import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select(
      "*, teachers(*, profiles(full_name)), subjects(name), classes(name, grade_level)",
    )
    .eq("school_id", school_id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { teacher_id, subject_id, class_id, academic_term_id } = body;
  if (!teacher_id || !subject_id || !class_id) {
    return NextResponse.json(
      { error: "teacher_id, subject_id, and class_id required" },
      { status: 400 },
    );
  }
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("teacher_subjects")
    .insert({ school_id, teacher_id, subject_id, class_id, academic_term_id })
    .select(
      "*, teachers(*, profiles(full_name)), subjects(name), classes(name)",
    )
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, can_publish } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("teacher_subjects")
    .update({ can_publish })
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
  const { error } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("id", id)
    .eq("school_id", school_id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
