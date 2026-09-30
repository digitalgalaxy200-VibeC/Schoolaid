import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// GET — list all teacher→subject→class assignments
// ?class_id=xxx to filter by class
// ?subject_id=xxx to filter by subject
export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const subjectId = searchParams.get("subject_id");

  let query = supabase
    .from("teacher_subjects")
    .select(
      "*, teachers(id, profile_id, profiles(full_name, email)), subjects(id, name, code), classes(id, name, grade_level)",
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (classId) query = query.eq("class_id", classId);
  if (subjectId) query = query.eq("subject_id", subjectId);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST — assign a teacher to a subject in a class
// teacher_id is optional (null = vacant, falls back to class primary teacher)
export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { teacher_id, subject_id, class_id, academic_term_id } = body;

  if (!subject_id || !class_id) {
    return NextResponse.json(
      { error: "subject_id and class_id required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Tenant guards (service client bypasses RLS): every FK must belong to this school.
  // teacher_subjects has no unique constraint including school_id, so ownership
  // verification of the FKs is what keeps the upsert school-scoped.
  if (teacher_id) {
    const { data: teacher } = await supabase.from("teachers").select("id").eq("id", teacher_id).eq("school_id", school_id).maybeSingle();
    if (!teacher)
      return NextResponse.json({ error: "Teacher not found in this school" }, { status: 400 });
  }
  {
    const { data: subject } = await supabase.from("subjects").select("id").eq("id", subject_id).eq("school_id", school_id).maybeSingle();
    if (!subject)
      return NextResponse.json({ error: "Subject not found in this school" }, { status: 400 });
  }
  {
    const { data: klass } = await supabase.from("classes").select("id").eq("id", class_id).eq("school_id", school_id).maybeSingle();
    if (!klass)
      return NextResponse.json({ error: "Class not found in this school" }, { status: 400 });
  }
  if (academic_term_id) {
    const { data: term } = await supabase.from("academic_terms").select("id").eq("id", academic_term_id).eq("school_id", school_id).maybeSingle();
    if (!term)
      return NextResponse.json({ error: "Term not found in this school" }, { status: 400 });
  }

  // One row per class+subject: reuse the existing row instead of inserting a
  // duplicate. (The composite unique key includes academic_term_id, which the
  // UI sends as NULL — NULLs never conflict, so the old upsert inserted a new
  // row on every change and stale duplicates piled up.)
  const { data: existingRow } = await supabase
    .from("teacher_subjects")
    .select("id")
    .eq("school_id", school_id)
    .eq("class_id", class_id)
    .eq("subject_id", subject_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = { is_active: true };
  if (teacher_id !== undefined) patch.teacher_id = teacher_id || null;
  if (academic_term_id !== undefined) patch.academic_term_id = academic_term_id || null;

  let result: unknown = null;
  if (existingRow) {
    const { data, error } = await supabase
      .from("teacher_subjects")
      .update(patch)
      .eq("id", existingRow.id)
      .eq("school_id", school_id)
      .select(
        "*, teachers(id, profile_id, profiles(full_name, email)), subjects(id, name, code), classes(id, name, grade_level)",
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;

    // Clear vacant duplicate rows left behind by the previous behaviour so the
    // assignment for this class+subject is unambiguous.
    await supabase
      .from("teacher_subjects")
      .delete()
      .eq("school_id", school_id)
      .eq("class_id", class_id)
      .eq("subject_id", subject_id)
      .is("teacher_id", null)
      .neq("id", existingRow.id);
  } else {
    const { data, error } = await supabase
      .from("teacher_subjects")
      .insert({
        school_id,
        teacher_id: teacher_id || null,
        subject_id,
        class_id,
        academic_term_id: academic_term_id || null,
        is_active: true,
      })
      .select(
        "*, teachers(id, profile_id, profiles(full_name, email)), subjects(id, name, code), classes(id, name, grade_level)",
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json(result);
}

// PATCH — update teacher assignment (reassign teacher, change active status)
export async function PATCH(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, teacher_id, is_active } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();
  const updates: Record<string, unknown> = {};
  if (teacher_id !== undefined) updates.teacher_id = teacher_id || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("teacher_subjects")
    .update(updates)
    .eq("id", id)
    .eq("school_id", school_id)
    .select(
      "*, teachers(id, profile_id, profiles(full_name, email)), subjects(id, name, code), classes(id, name, grade_level)",
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — remove a teacher→subject→class assignment
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
