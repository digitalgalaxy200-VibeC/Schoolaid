import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Get teacher's DB record
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (!teacher) return NextResponse.json([]);

  // Step 1: Check if this teacher is the Class Teacher for this class
  const { data: classTeacher } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true)
    .maybeSingle();

  // If they are a Class Teacher, they get access to ALL subjects for this class
  if (classTeacher) {
    const { data: allSubjects, error } = await supabase
      .from("class_subjects")
      .select("id, subject_id, subjects(id, name, code)")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .eq("is_active", true);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(allSubjects || []);
  }

  // Step 2: Not a Class Teacher — check if they have specific subject assignments
  const { data: assigned, error: assignError } = await supabase
    .from("teacher_subjects")
    .select("id, subject_id, subjects(id, name, code)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true);

  if (assignError) return NextResponse.json({ error: assignError.message }, { status: 500 });

  // Return specific assignments (or empty if they have none and are not a class teacher)
  return NextResponse.json(assigned || []);
}
