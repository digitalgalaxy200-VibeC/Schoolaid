import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { student_id, term_id, comment } = await request.json();
  if (!student_id || !term_id) return NextResponse.json({ error: "student_id and term_id required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: prev } = await supabase.from("school_admin_comments")
    .select("comment").eq("student_id", student_id).eq("term_id", term_id).maybeSingle();

  const { error } = await supabase.from("school_admin_comments").upsert(
    { school_id, student_id, term_id, comment: comment || null },
    { onConflict: "student_id,term_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id: null, term_id, user_id: userId, action: "admin_comment",
    details: { student_id, previous: prev?.comment || null, new: comment || null },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id");
  const termId = searchParams.get("term_id");
  if (!studentId || !termId) return NextResponse.json({ error: "student_id and term_id required" }, { status: 400 });

  const supabase = getServiceClient();
  await supabase.from("school_admin_comments").delete().eq("student_id", studentId).eq("term_id", termId);

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id: null, term_id: termId, user_id: userId, action: "admin_comment_reset",
    details: { student_id: studentId },
  });

  return NextResponse.json({ success: true });
}
