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

  const { data } = await supabase.from("students").select("*, profiles!inner(full_name, email, is_active)").eq("school_id", school_id).eq("class_id", classId).eq("profiles.is_active", true);
  return NextResponse.json(data || []);
}
