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

  const { data: submission } = await supabase
    .from("report_card_submissions").select("id, status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Already submitted" }, { status: 423 });

  const { data: studentsRaw, error: studentsError } = await supabase
    .from("students")
    .select("id, profiles!inner(full_name, is_active)")
    .eq("school_id", school_id)
    .eq("class_id", class_id)
    .eq("profiles.is_active", true);
  
  if (studentsError) console.error("[submit] Error fetching students:", studentsError.message);
  console.log(`[submit] Found ${studentsRaw?.length ?? 0} students for class_id=${class_id}`);
  
  const studentIds = (studentsRaw || []).map((s) => s.id);
  const studentNames = (studentsRaw || []).reduce((acc: Record<string, string>, s: any) => {
    const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    acc[s.id] = p?.full_name || "Unknown";
    return acc;
  }, {});
  if (studentIds.length === 0) return NextResponse.json({ error: "No students in class" }, { status: 400 });

  if (!force) {
    const { data: classSubjects } = await supabase
      .from("class_subjects").select("subject_id, subjects(name)").eq("school_id", school_id).eq("class_id", class_id).eq("is_active", true);
    const [psychomotorTraits, affectiveTraits] = await Promise.all([
      resolveTemplateRows(school_id, class_id, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
      resolveTemplateRows(school_id, class_id, "class_affective_templates", "affective_templates", "affective_rows"),
    ]);

    const [{ data: scores }, { data: attendance }, { data: psycho }, { data: aff }, { data: comments }] = await Promise.all([
      supabase.from("student_scores").select("student_id, subject_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("attendance_records").select("student_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("psychomotor_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("affective_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
      supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    ]);

    const incompleteStudentIds = new Set<string>();

    for (const cs of (classSubjects || []) as any[]) {
      for (const sid of studentIds) {
        if (!(scores || []).some((sc) => sc.student_id === sid && sc.subject_id === cs.subject_id)) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    for (const sid of studentIds) {
      if (!(attendance || []).some((a) => a.student_id === sid)) incompleteStudentIds.add(sid);
    }
    if (psychomotorTraits.length > 0) {
      for (const sid of studentIds) {
        if (!psychomotorTraits.every((t: any) => (psycho || []).some((p) => p.student_id === sid && p.trait_id === t.id))) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    if (affectiveTraits.length > 0) {
      for (const sid of studentIds) {
        if (!affectiveTraits.every((t: any) => (aff || []).some((p) => p.student_id === sid && p.trait_id === t.id))) {
          incompleteStudentIds.add(sid);
        }
      }
    }
    for (const sid of studentIds) {
      if (!(comments || []).some((c) => c.student_id === sid && c.comment?.trim())) incompleteStudentIds.add(sid);
    }

    if (incompleteStudentIds.size > 0) {
      const incompleteStudents = (studentsRaw || [])
        .filter((s) => incompleteStudentIds.has(s.id))
        .map((s) => ({ id: s.id, name: studentNames[s.id] || "Unknown" }));

      return NextResponse.json(
        { error: "Submission incomplete", incompleteStudents },
        { status: 422 }
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("report_card_submissions").upsert(
    { school_id, class_id, term_id, status: "pending_approval", submitted_by: userId, submitted_at: now, return_reason: null },
    { onConflict: "class_id,term_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id, term_id, user_id: userId, action: "submit", details: { students: studentIds.length, forced: !!force },
  });

  try {
    const { data: studentsWithGender } = await supabase
      .from("students").select("id, profiles(full_name), gender").eq("school_id", school_id).eq("class_id", class_id);

    const gradingRows = await resolveTemplateRows(school_id, class_id, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score");

    const { data: allScores } = await supabase
      .from("student_scores").select("student_id, subject_id, component_id, score").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds);

    const components = await resolveTemplateRows(school_id, class_id, "class_components_templates", "components_templates", "components_rows");
    const maxTotal = (components || []).reduce((sum: number, c: any) => sum + (Number(c.maximum_score) || 0), 0);

    const principalRemarks: { student_id: string; comment: string }[] = [];

    for (const s of (studentsWithGender || [])) {
      const studentScores = (allScores || []).filter((sc: any) => sc.student_id === s.id);

      // Correct overall percentage: group component scores by subject, then
      // average the per-subject totals as a percentage of maxTotal.
      const subjectTotals = new Map<string, number>();
      for (const sc of studentScores) {
        const sid = sc.subject_id || "__none__";
        subjectTotals.set(sid, (subjectTotals.get(sid) || 0) + (Number(sc.score) || 0));
      }
      const subjectTotalValues = Array.from(subjectTotals.values());
      const avg = subjectTotalValues.length > 0 && maxTotal > 0
        ? (subjectTotalValues.reduce((a, b) => a + b, 0) / subjectTotalValues.length / maxTotal) * 100
        : 0;

      const firstName = (s.profiles as any)?.full_name?.split(" ")[0] || "Student";
      const genderStr = s.gender || null;
      const isFemale = genderStr?.toLowerCase() === "female" || genderStr?.toLowerCase() === "f";
      const isMale = genderStr?.toLowerCase() === "male" || genderStr?.toLowerCase() === "m";
      const heShe = isFemale ? "She" : isMale ? "He" : "They";
      const hisHer = isFemale ? "her" : isMale ? "his" : "their";

      const matchedGrade = (gradingRows as any[])?.find((g: any) => avg >= Number(g.minimum_score) && avg <= Number(g.maximum_score));

      let remark = "";
      if (matchedGrade?.principal_remark) {
        remark = matchedGrade.principal_remark
          .replace(/{name}/gi, firstName)
          .replace(/{average}/gi, avg.toFixed(1))
          .replace(/{grade}/gi, matchedGrade.grade)
          .replace(/{He\/She}/g, heShe)
          .replace(/{he\/she}/g, heShe.toLowerCase())
          .replace(/{his\/her}/gi, hisHer)
          .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
          .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
      } else {
        // Derive from the school's configured grading descriptor, not hardcoded thresholds
        const descriptor = (matchedGrade?.remark || "satisfactory").toLowerCase();
        remark = `${firstName} had a ${descriptor} result.`;
      }

      principalRemarks.push({ student_id: s.id, comment: remark });
    }

    if (principalRemarks.length > 0) {
      // Only skip students who have a MANUAL comment. Auto-generated comments
      // (is_manual = false) may be regenerated when the class is resubmitted.
      const { data: existingManual } = await supabase
        .from("school_admin_comments").select("student_id, is_manual").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds);
      const manualIds = new Set((existingManual || []).filter((e: any) => e.is_manual === true).map((e: any) => e.student_id));

      const toInsert = principalRemarks.filter(r => !manualIds.has(r.student_id));
      if (toInsert.length > 0) {
        await supabase.from("school_admin_comments").upsert(
          toInsert.map(r => ({
            school_id, student_id: r.student_id, term_id, comment: r.comment, is_manual: false,
          })),
          { onConflict: "student_id,term_id" }
        );
      }
    }
  } catch (genErr: any) {
    console.error("[submit] Failed to auto-generate principal remarks:", genErr.message);
  }

  return NextResponse.json({ success: true, status: "pending_approval" });
}
