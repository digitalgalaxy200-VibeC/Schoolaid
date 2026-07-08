import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

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

  // Run all count queries in parallel
  const [teachersRes, studentsRes, classesRes, subjectsRes] = await Promise.all(
    [
      supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("school_id", id),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", id),
      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("school_id", id),
      supabase
        .from("subjects")
        .select("id", { count: "exact", head: true })
        .eq("school_id", id),
    ],
  );

  return NextResponse.json({
    teachers: teachersRes.count || 0,
    students: studentsRes.count || 0,
    classes: classesRes.count || 0,
    subjects: subjectsRes.count || 0,
  });
}
