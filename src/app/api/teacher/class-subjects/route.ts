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

  // Step 1: Check if this teacher has specific subject assignments for this class
  const { data: assigned } = await supabase
    .from("teacher_subjects")
    .select("id, subject_id, subjects(id, name, code)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true);

  // If the teacher has specific subject assignments → return only those
  if (assigned && assigned.length > 0) {
    return NextResponse.json(assigned);
  }

  // Step 2: No specific assignments — fall back to ALL subjects in the class
  // This covers class teachers / form tutors who handle all subjects
  const { data: allSubjects, error } = await supabase
    .from("class_subjects")
    .select("id, subject_id, subjects(id, name, code)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(allSubjects || []);
}
