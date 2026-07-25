import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  // Get classes
  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("school_id", school_id)
    .order("grade_level")
    .order("name");

  if (!classes || classes.length === 0) return NextResponse.json([]);

  // Get primary teachers for all classes
  const classIds = classes.map((c) => c.id);
  const { data: classTeachers } = await supabase
    .from("class_teachers")
    .select("class_id, role, teachers(profiles(full_name))")
    .eq("school_id", school_id)
    .in("class_id", classIds)
    .eq("is_active", true);

  // Build map: class_id → primary teacher name
  const teacherMap = new Map<string, string>();
  for (const ct of (classTeachers || []) as any[]) {
    if (ct.role !== "primary") continue;
    const profile = Array.isArray(ct.teachers?.profiles)
      ? ct.teachers.profiles[0]
      : ct.teachers?.profiles;
    teacherMap.set(ct.class_id, profile?.full_name || "Unassigned");
  }

  // Attach primary teacher name to each class
  const result = classes.map((c) => ({
    ...c,
    primary_teacher: teacherMap.get(c.id) || null,
    student_count: null, // placeholder, can be added later
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("classes")
    .insert({ ...body, school_id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...body } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("classes")
    .update(body)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
