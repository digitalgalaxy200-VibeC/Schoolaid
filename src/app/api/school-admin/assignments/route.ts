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

// POST — assign a teacher to a subject, in one class or many
//
// Body: { subject_id, teacher_id?, class_id?, class_ids?, academic_term_id? }
//   class_ids   the central Assignments screen sends every ticked class
//   class_id    the per-class dialog sends one
//   teacher_id  omitted/null keeps the old "vacant" meaning
//
// A `teacher_subjects` row is a STATEMENT — "this person teaches this subject in
// this class" — not a single slot. The unique key is
// (teacher_id, subject_id, class_id, academic_term_id), so two people can both
// teach Year 2 Mathematics. This used to reuse the first row for a class+subject
// and silently REPLACE whoever was there.
export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { teacher_id, subject_id, class_id, class_ids, academic_term_id } = body;

  // One request may target many classes; a single class_id still works.
  const requested: unknown[] = Array.isArray(class_ids) && class_ids.length > 0 ? class_ids : [class_id];
  const targetClassIds = [
    ...new Set(requested.filter((v): v is string => typeof v === "string" && v.length > 0)),
  ];

  if (!subject_id || targetClassIds.length === 0) {
    return NextResponse.json(
      { error: "subject_id and class_id (or class_ids) required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Tenant guards (service client bypasses RLS): every FK must belong to this school.
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
    const { data: owned } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", school_id)
      .in("id", targetClassIds);
    const ownedIds = new Set((owned ?? []).map((c) => c.id as string));
    const missing = targetClassIds.filter((id) => !ownedIds.has(id));
    if (missing.length > 0)
      return NextResponse.json(
        { error: `Class not found in this school: ${missing.join(", ")}` },
        { status: 400 },
      );
  }
  if (academic_term_id) {
    const { data: term } = await supabase.from("academic_terms").select("id").eq("id", academic_term_id).eq("school_id", school_id).maybeSingle();
    if (!term)
      return NextResponse.json({ error: "Term not found in this school" }, { status: 400 });
  }

  const columns =
    "*, teachers(id, profile_id, profiles(full_name, email)), subjects(id, name, code), classes(id, name, grade_level)";

  const rows: unknown[] = [];
  for (const classId of targetClassIds) {
    if (teacher_id) {
      const { data: existingOwn } = await supabase
        .from("teacher_subjects")
        .select("id")
        .eq("school_id", school_id)
        .eq("class_id", classId)
        .eq("subject_id", subject_id)
        .eq("teacher_id", teacher_id)
        .limit(1)
        .maybeSingle();

      const { data: assigned, error: assignError } = existingOwn
        ? await supabase
            .from("teacher_subjects")
            .update({ is_active: true })
            .eq("id", existingOwn.id)
            .eq("school_id", school_id)
            .select(columns)
            .single()
        : await supabase
            .from("teacher_subjects")
            .insert({
              school_id,
              teacher_id,
              subject_id,
              class_id: classId,
              academic_term_id: academic_term_id || null,
              is_active: true,
            })
            .select(columns)
            .single();
      if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 });

      // A vacant row for the same class+subject is now meaningless — the subject
      // has a teacher — and a stale one used to make the dialog look ambiguous.
      await supabase
        .from("teacher_subjects")
        .delete()
        .eq("school_id", school_id)
        .eq("class_id", classId)
        .eq("subject_id", subject_id)
        .is("teacher_id", null);

      rows.push(assigned);
      continue;
    }

    // Vacant: this class+subject currently has no teacher. Reuse an existing
    // vacant row so repeated calls do not pile up duplicates, and leave any real
    // assignments alone.
    const { data: vacantRow } = await supabase
      .from("teacher_subjects")
      .select("id")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .eq("subject_id", subject_id)
      .is("teacher_id", null)
      .limit(1)
      .maybeSingle();

    const { data, error } = vacantRow
      ? await supabase
          .from("teacher_subjects")
          .update({ is_active: true, academic_term_id: academic_term_id || null })
          .eq("id", vacantRow.id)
          .eq("school_id", school_id)
          .select(columns)
          .single()
      : await supabase
          .from("teacher_subjects")
          .insert({
            school_id,
            teacher_id: null,
            subject_id,
            class_id: classId,
            academic_term_id: academic_term_id || null,
            is_active: true,
          })
          .select(columns)
          .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(data);
  }

  // A single-class caller has always received the row itself; keep that, and give
  // a bulk caller the count too.
  return NextResponse.json(
    rows.length === 1 ? rows[0] : { assigned: rows.length, rows },
  );
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
