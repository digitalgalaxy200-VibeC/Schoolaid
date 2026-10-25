// ============================================================
// DELETE /api/school-admin/students/{id}/photo
//
// Removes a student's profile photo. A student has TWO copies of it:
//   profiles.avatar_url — shown in the roster and edit form
//   students.photo_url  — shown on the student's own profile
// Clearing only one leaves a half-deleted photo, so both are cleared here.
//
// This is an administrator action. Students cannot delete their own photo:
// their profile page has no delete control, and /api/student/profile does not
// write either column to null.
// ============================================================

import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Tenant guard: the student must belong to the caller's school.
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const { error: studentError } = await supabase
    .from("students")
    .update({ photo_url: null })
    .eq("id", id)
    .eq("school_id", school_id);

  if (studentError) {
    return NextResponse.json({ error: studentError.message }, { status: 500 });
  }

  if (student.profile_id) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", student.profile_id)
      .eq("school_id", school_id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
