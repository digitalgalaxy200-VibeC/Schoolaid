import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });
  const supabase = getServiceClient();

  // Ownership — caller must teach this class (class teacher, or subject assignment in it)
  if (!all_classes) {
    const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const { data: classTeacher } = await supabase.from("class_teachers").select("id").eq("school_id", school_id).eq("class_id", classId).eq("teacher_id", teacher.id).eq("is_active", true).maybeSingle();
    if (!classTeacher) {
      const { data: assignment } = await supabase.from("teacher_subjects").select("id").eq("school_id", school_id).eq("teacher_id", teacher.id).eq("class_id", classId).eq("is_active", true).limit(1).maybeSingle();
      if (!assignment) return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }
  }

  const { data } = await supabase
    .from("students")
    // The name PARTS ride along so the edit form opens on what is stored,
    // rather than re-splitting a display name it cannot reconstruct.
    .select("*, profiles!inner(full_name, email, is_active, first_name, middle_name, last_name)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("profiles.is_active", true);

  // The stored temporary password is deliberately NOT returned: a teacher sees
  // a generated password exactly once, on the reset response. Without this, a
  // reload of the roster would resurrect the credential on screen.
  return NextResponse.json(
    (data || []).map((row: Record<string, unknown>) => {
      const copy = { ...row };
      delete copy.generated_password;
      return copy;
    }),
  );
}
