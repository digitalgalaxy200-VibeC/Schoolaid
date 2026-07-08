import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data: t } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
  if (!t) return NextResponse.json([]);
  const { data } = await supabase.from("teacher_subjects").select("*, subjects(name,code), classes(name,grade_level)").eq("school_id",school_id).eq("teacher_id",t.id);
  return NextResponse.json(data||[]);
}
