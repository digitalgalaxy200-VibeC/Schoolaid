import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm } from "@/lib/report-card";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ activeTerm: null, classes: [] });

  const supabase = getServiceClient();

  const { data: classTeachers } = await supabase
    .from("class_teachers")
    .select("class_id, role, classes(name, grade_level), teachers(profiles(full_name))")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .eq("role", "primary");

  const classMap = new Map<string, { id: string; name: string; grade: string; formTeacher: string }>();
  for (const ct of (classTeachers || []) as any[]) {
    const cls = Array.isArray(ct.classes) ? ct.classes[0] : ct.classes;
    const teacher = Array.isArray(ct.teachers) ? ct.teachers[0] : ct.teachers;
    const profile = teacher ? (Array.isArray(teacher.profiles) ? teacher.profiles[0] : teacher.profiles) : null;
    classMap.set(ct.class_id, {
      id: ct.class_id,
      name: cls?.name || "Unknown",
      grade: cls?.grade_level || "",
      formTeacher: profile?.full_name || "Unassigned",
    });
  }

  const classIds = Array.from(classMap.keys());
  if (classIds.length === 0) return NextResponse.json({ activeTerm, classes: [] });

  const [{ data: submissions }, { data: studentCounts }] = await Promise.all([
    supabase
      .from("report_card_submissions")
      .select("class_id, status, submitted_by, submitted_at, reviewed_at")
      .eq("school_id", school_id)
      .eq("term_id", activeTerm.id)
      .in("class_id", classIds),
    supabase.from("students").select("class_id").eq("school_id", school_id).in("class_id", classIds),
  ]);

  const submitterIds = [...new Set((submissions || []).map((s) => s.submitted_by).filter(Boolean))] as string[];
  const submitterNames = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", submitterIds);
    for (const p of profiles || []) submitterNames.set(p.id, p.full_name);
  }

  const countMap = new Map<string, number>();
  for (const r of studentCounts || []) countMap.set(r.class_id, (countMap.get(r.class_id) || 0) + 1);

  const classes = classIds.map((id) => {
    const c = classMap.get(id)!;
    const sub = (submissions || []).find((s) => s.class_id === id);
    return {
      ...c,
      studentCount: countMap.get(id) || 0,
      status: sub?.status || "draft",
      submittedAt: sub?.submitted_at || null,
      submittedBy: sub?.submitted_by ? submitterNames.get(sub.submitted_by) || null : null,
      reviewedAt: sub?.reviewed_at || null,
    };
  });

  return NextResponse.json({ activeTerm, classes });
}
