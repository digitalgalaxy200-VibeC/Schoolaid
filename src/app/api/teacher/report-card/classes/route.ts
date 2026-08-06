import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, getActiveTerm } from "@/lib/report-card";

export async function GET() {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();

  // Impersonated super admin: return ALL classes as accessible
  if (all_classes) {
    const { data: allClasses } = await supabase
      .from("classes")
      .select("id, name, grade_level")
      .eq("school_id", school_id)
      .order("name");

    const activeTerm = await getActiveTerm(school_id);
    const classIds = (allClasses || []).map(c => c.id);
    let submissions: any[] = [];
    if (activeTerm && classIds.length > 0) {
      const { data } = await supabase
        .from("report_card_submissions")
        .select("class_id, status")
        .eq("school_id", school_id)
        .eq("term_id", activeTerm.id)
        .in("class_id", classIds);
      submissions = data || [];
    }
    const classes = (allClasses || []).map(c => ({
      id: c.id, name: c.name || "Unknown", grade: c.grade_level || "",
      role: "impersonated",
      status: submissions.find(s => s.class_id === c.id)?.status || "draft",
    }));
    return NextResponse.json({ isClassTeacher: classes.length > 0, activeTerm, classes });
  }

  // Normal teacher flow
  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const { data: assignments } = await supabase
    .from("class_teachers")
    .select("class_id, role, classes(name, grade_level)")
    .eq("school_id", school_id)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true);

  const activeTerm = await getActiveTerm(school_id);

  const classes = (assignments || []).map((a: any) => {
    const cls = Array.isArray(a.classes) ? a.classes[0] : a.classes;
    return { id: a.class_id, name: cls?.name || "Unknown", grade: cls?.grade_level || "", role: a.role };
  });

  let submissions: any[] = [];
  if (activeTerm && classes.length > 0) {
    const { data } = await supabase
      .from("report_card_submissions")
      .select("class_id, status")
      .eq("school_id", school_id)
      .eq("term_id", activeTerm.id)
      .in("class_id", classes.map((c) => c.id));
    submissions = data || [];
  }
  const withStatus = classes.map((c) => ({
    ...c,
    status: submissions.find((s) => s.class_id === c.id)?.status || "draft",
  }));

  return NextResponse.json({ isClassTeacher: classes.length > 0, activeTerm, classes: withStatus });
}
