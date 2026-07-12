import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("class_subjects")
    .select("id, subject_id, subjects(id, name, code)")
    .eq("school_id", school_id)
    .eq("class_id", classId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
