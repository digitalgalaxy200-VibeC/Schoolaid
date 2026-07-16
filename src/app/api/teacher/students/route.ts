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
  const { data } = await supabase.from("students").select("*, profiles(full_name, email)").eq("school_id", school_id).eq("class_id", classId);
  return NextResponse.json(data || []);
}
