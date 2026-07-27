import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("report_card_settings").select("*").eq("school_id", school_id).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || {});
}

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { show_position, show_average, show_attendance, show_psychomotor, show_affective, show_teacher_remark, show_admin_remark, show_grading_key, show_photo, show_gender, show_dob, show_component_scores } = body;

  const supabase = getServiceClient();
  
  const payload = {
    school_id,
    show_position: Boolean(show_position),
    show_average: Boolean(show_average),
    show_attendance: Boolean(show_attendance),
    show_psychomotor: Boolean(show_psychomotor),
    show_affective: Boolean(show_affective),
    show_teacher_remark: Boolean(show_teacher_remark),
    show_admin_remark: Boolean(show_admin_remark),
    show_grading_key: Boolean(show_grading_key),
    show_photo: Boolean(show_photo),
    show_gender: Boolean(show_gender),
    show_dob: Boolean(show_dob),
    show_component_scores: Boolean(show_component_scores),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { data, error } = await supabase.from("report_card_settings").upsert(payload, { onConflict: "school_id" }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
