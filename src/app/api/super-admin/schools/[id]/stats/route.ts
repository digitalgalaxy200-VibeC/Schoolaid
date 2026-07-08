import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id } = await params;

  // First resolve slug to school_id if needed
  let schoolId = id;
  if (!isUUID(id)) {
    const { data: school } = await supabase
      .from("schools")
      .select("id")
      .eq("slug", id)
      .single();
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });
    schoolId = school.id;
  }

  // Run all count queries in parallel
  const [teachersRes, studentsRes, classesRes, subjectsRes] = await Promise.all(
    [
      supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
      supabase
        .from("subjects")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
    ],
  );

  return NextResponse.json({
    teachers: teachersRes.count || 0,
    students: studentsRes.count || 0,
    classes: classesRes.count || 0,
    subjects: subjectsRes.count || 0,
  });
}
