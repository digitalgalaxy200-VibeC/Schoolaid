import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", userId)
    .single();
  if (!teacher)
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const { data: school } = await supabase
    .from("schools")
    .select("name, logo_url")
    .eq("id", school_id)
    .single();
  const { data: activeTerm } = await supabase
    .from("academic_terms")
    .select("id, name")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();

  const { data: assignments } = await supabase
    .from("teacher_subjects")
    .select(
      "id, class_id, subject_id, subjects(name,code), classes(name,grade_level)",
    )
    .eq("school_id", school_id)
    .eq("teacher_id", teacher.id);
  const { data: classTeachers } = await supabase
    .from("class_teachers")
    .select("class_id, role, classes(name,grade_level)")
    .eq("school_id", school_id)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true);

  const classMap = new Map<string, any>();

  for (const a of (assignments || []) as any[]) {
    const cls = Array.isArray(a.classes) ? a.classes[0] : a.classes;
    const subj = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects;
    if (!classMap.has(a.class_id)) {
      classMap.set(a.class_id, {
        id: a.class_id,
        name: cls?.name || "Unknown",
        grade: cls?.grade_level || "",
        subjects: [],
        role: null,
      });
    }
    const e = classMap.get(a.class_id);
    if (a.subject_id && !e.subjects.find((s: any) => s.id === a.subject_id)) {
      e.subjects.push({ id: a.subject_id, name: subj?.name || "Unknown" });
    }
  }

  for (const ct of (classTeachers || []) as any[]) {
    const cls = Array.isArray(ct.classes) ? ct.classes[0] : ct.classes;
    if (!classMap.has(ct.class_id)) {
      classMap.set(ct.class_id, {
        id: ct.class_id,
        name: cls?.name || "Unknown",
        grade: cls?.grade_level || "",
        subjects: [],
        role: ct.role,
      });
    } else {
      classMap.get(ct.class_id).role = ct.role;
    }
  }

  const classes = await Promise.all(
    Array.from(classMap.values()).map(async (c: any) => {
      const { count } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("school_id", school_id)
        .eq("class_id", c.id);
      return { ...c, studentCount: count || 0 };
    }),
  );

  return NextResponse.json({ school: school || null, activeTerm, classes });
}
