import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();

  // ── Impersonated super admin: return ALL classes in the school ──
  if (all_classes) {
    const [classRes, schoolRes, termRes] = await Promise.all([
      supabase.from("classes").select("id, name, grade_level").eq("school_id", school_id).order("name"),
      supabase.from("schools").select("name, logo_url").eq("id", school_id).single(),
      supabase.from("academic_terms").select("id, name, session_id").eq("school_id", school_id).eq("is_active", true).maybeSingle(),
    ]);

    const school = schoolRes.data;
    const activeTerm = termRes.data;
    let sessionName = "";
    if (activeTerm?.session_id) {
      const { data: session } = await supabase.from("academic_sessions").select("name").eq("id", activeTerm.session_id).single();
      sessionName = session?.name || "";
    }

    const allClassIds = (classRes.data || []).map(c => c.id);

    // Fetch subjects for all classes
    const { data: allClassSubjects } = allClassIds.length > 0
      ? await supabase.from("class_subjects")
          .select("class_id, subject_id, subjects(name)")
          .eq("school_id", school_id)
          .in("class_id", allClassIds)
          .eq("is_active", true)
      : { data: null };

    const subjectMap = new Map<string, { id: string; name: string }[]>();
    for (const cs of (allClassSubjects || [])) {
      if (!subjectMap.has(cs.class_id)) subjectMap.set(cs.class_id, []);
      const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
      subjectMap.get(cs.class_id)!.push({ id: cs.subject_id, name: subj?.name || "Unknown" });
    }

    // Student counts
    const { data: counts } = allClassIds.length > 0
      ? await supabase.from("students").select("class_id").eq("school_id", school_id).in("class_id", allClassIds)
      : { data: null };
    const countMap = new Map<string, number>();
    for (const r of (counts || [])) countMap.set(r.class_id, (countMap.get(r.class_id) || 0) + 1);

    const classes = (classRes.data || []).map(c => ({
      id: c.id,
      name: c.name || "Unknown",
      grade: c.grade_level || "",
      subjects: subjectMap.get(c.id) || [],
      role: "Impersonated",
      studentCount: countMap.get(c.id) || 0,
    }));

    return NextResponse.json({
      school: school || null,
      activeTerm: activeTerm ? { id: activeTerm.id, name: activeTerm.name, session_name: sessionName } : null,
      classes,
      all_classes: true,
    });
  }

  // ── Normal teacher flow ──
  const [teacherRes, schoolRes, termRes] = await Promise.all([
    supabase.from("teachers").select("id").eq("profile_id", userId).single(),
    supabase.from("schools").select("name, logo_url").eq("id", school_id).single(),
    supabase.from("academic_terms").select("id, name, session_id").eq("school_id", school_id).eq("is_active", true).maybeSingle(),
  ]);

  const teacher = teacherRes.data;
  if (!teacher)
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const school = schoolRes.data;
  const activeTerm = termRes.data;

  let sessionName = "";
  if (activeTerm?.session_id) {
    const { data: session } = await supabase.from("academic_sessions").select("name").eq("id", activeTerm.session_id).single();
    sessionName = session?.name || "";
  }

  const [assignRes, ctRes] = await Promise.all([
    supabase.from("teacher_subjects").select("id, class_id, subject_id, subjects(name,code), classes(name,grade_level)").eq("school_id", school_id).eq("teacher_id", teacher.id),
    supabase.from("class_teachers").select("class_id, role, classes(name,grade_level)").eq("school_id", school_id).eq("teacher_id", teacher.id).eq("is_active", true),
  ]);

  const assignments = assignRes.data || [];
  const classTeachers = ctRes.data || [];

  const classMap = new Map<string, any>();
  for (const a of assignments as any[]) {
    const cls = Array.isArray(a.classes) ? a.classes[0] : a.classes;
    const subj = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects;
    if (!classMap.has(a.class_id)) {
      classMap.set(a.class_id, { id: a.class_id, name: cls?.name || "Unknown", grade: cls?.grade_level || "", subjects: [], role: null });
    }
    const e = classMap.get(a.class_id);
    if (a.subject_id && !e.subjects.find((s: any) => s.id === a.subject_id)) {
      e.subjects.push({ id: a.subject_id, name: subj?.name || "Unknown" });
    }
  }
  for (const ct of classTeachers as any[]) {
    const cls = Array.isArray(ct.classes) ? ct.classes[0] : ct.classes;
    if (!classMap.has(ct.class_id)) {
      classMap.set(ct.class_id, { id: ct.class_id, name: cls?.name || "Unknown", grade: cls?.grade_level || "", subjects: [], role: ct.role });
    } else {
      classMap.get(ct.class_id).role = ct.role;
    }
  }

  const classIds = Array.from(classMap.keys());
  const classTeacherClassIds = Array.from(classMap.entries())
    .filter(([_, c]) => c.role !== null)
    .map(([id]) => id);

  if (classTeacherClassIds.length > 0) {
    const { data: allClassSubjects } = await supabase
      .from("class_subjects")
      .select("class_id, subject_id, subjects(name)")
      .eq("school_id", school_id)
      .in("class_id", classTeacherClassIds)
      .eq("is_active", true);

    for (const cs of (allClassSubjects || [])) {
      const entry = classMap.get(cs.class_id);
      if (!entry) continue;
      const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
      if (!entry._classTeacherSubjectsLoaded) {
        entry.subjects = [];
        entry._classTeacherSubjectsLoaded = true;
      }
      if (cs.subject_id && !entry.subjects.find((s: any) => s.id === cs.subject_id)) {
        entry.subjects.push({ id: cs.subject_id, name: subj?.name || "Unknown" });
      }
    }
  }

  const classesNeedingSubjects = Array.from(classMap.entries())
    .filter(([_, c]) => c.subjects.length === 0 && c.role === null)
    .map(([id]) => id);

  if (classesNeedingSubjects.length > 0) {
    const { data: fallbackSubjects } = await supabase.from("class_subjects")
      .select("class_id, subject_id, subjects(name)").eq("school_id", school_id).in("class_id", classesNeedingSubjects).eq("is_active", true);
    for (const fs of (fallbackSubjects || [])) {
      const entry = classMap.get(fs.class_id);
      if (entry && fs.subject_id) {
        const subj = Array.isArray(fs.subjects) ? fs.subjects[0] : fs.subjects;
        if (!entry.subjects.find((s: any) => s.id === fs.subject_id)) {
          entry.subjects.push({ id: fs.subject_id, name: subj?.name || "Unknown" });
        }
      }
    }
  }

  const classes = classIds.length > 0
    ? await (async () => {
        const { data: counts } = await supabase.from("students").select("class_id").eq("school_id", school_id).in("class_id", classIds);
        const countMap = new Map<string, number>();
        for (const r of (counts || [])) countMap.set(r.class_id, (countMap.get(r.class_id) || 0) + 1);
        return Array.from(classMap.values()).map((c: any) => ({ ...c, studentCount: countMap.get(c.id) || 0 }));
      })()
    : [];

  return NextResponse.json({
    school: school || null,
    activeTerm: activeTerm ? { id: activeTerm.id, name: activeTerm.name, session_name: sessionName } : null,
    classes,
  });
}
