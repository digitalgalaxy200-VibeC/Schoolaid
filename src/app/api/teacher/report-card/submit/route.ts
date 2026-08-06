import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked, resolveTemplateRows } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    console.error("[submit] Unauthorized — no valid session cookie");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  let body: { class_id?: string; force?: boolean } = {};
  try {
    body = await request.json();
  } catch (e) {
    console.error("[submit] Failed to parse request body:", e);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { class_id, force } = body;
  
  console.log(`[submit] userId=${userId} school_id=${school_id} class_id=${class_id} force=${force}`);
  if (!class_id) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  if (!all_classes) {
    const teacher = await getTeacherByProfile(userId);
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    if (!(await isClassTeacher(school_id, teacher.id, class_id)))
      return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });
  }

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();
