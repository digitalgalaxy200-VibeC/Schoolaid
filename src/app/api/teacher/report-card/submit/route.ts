import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked, resolveTemplateRows } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
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


  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, class_id)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  const { data: submission } = await supabase
    .from("report_card_submissions").select("id, status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Already submitted" }, { status: 423 });

  // ── Readiness check (server-side, never trust the client) ──
  const { data: studentsRaw } = await supabase.from("students").select("id, full_name").eq("school_id", school_id).eq("class_id", class_id);
  const studentIds = (studentsRaw || []).map((s) => s.id);
  if (studentIds.length === 0) return NextResponse.json({ error: "No students in class" }, { status: 400 });

  // Only run validation if not forcing through
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

    // Find which specific students are incomplete
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
      // Map IDs back to names for the frontend
      const incompleteStudents = (studentsRaw || [])
        .filter((s) => incompleteStudentIds.has(s.id))
        .map((s) => ({ id: s.id, name: s.full_name }));

      return NextResponse.json(
        { error: "Submission incomplete", incompleteStudents },
        { status: 422 }
      );
    }
  }

  // ── Transition ──
  const now = new Date().toISOString();
  const { error } = await supabase.from("report_card_submissions").upsert(
    { school_id, class_id, term_id, status: "pending_approval", submitted_by: userId, submitted_at: now, return_reason: null },
    { onConflict: "class_id,term_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id, term_id, user_id: userId, action: "submit", details: { students: studentIds.length, forced: !!force },
  });

  // ── Auto-generate Principal Remarks for all students ──
  try {
    const { data: studentsWithGender } = await supabase
      .from("students").select("id, profiles(full_name), gender").eq("school_id", school_id).eq("class_id", class_id);

    const gradingRows = await resolveTemplateRows(school_id, class_id, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score");

    const { data: allScores } = await supabase
      .from("student_scores").select("student_id, component_id, score").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds);

    const components = await resolveTemplateRows(school_id, class_id, "class_components_templates", "components_templates", "components_rows");
    const maxTotal = (components || []).reduce((sum: number, c: any) => sum + (Number(c.maximum_score) || 0), 0);

    const principalRemarks: { student_id: string; comment: string }[] = [];

    for (const s of (studentsWithGender || [])) {
      const studentScores = (allScores || []).filter((sc: any) => sc.student_id === s.id);
      const total = studentScores.reduce((sum: number, sc: any) => sum + (Number(sc.score) || 0), 0);
      const subjectCount = new Set(studentScores.map((sc: any) => sc.component_id)).size || 1;
      const avg = maxTotal > 0 ? (total / subjectCount / maxTotal) * 100 : 0;

      const firstName = (s.profiles as any)?.full_name?.split(" ")[0] || "Student";
      const fullName = (s.profiles as any)?.full_name || firstName;
      const genderStr = s.gender || null;
      const isFemale = genderStr?.toLowerCase() === "female" || genderStr?.toLowerCase() === "f";
      const isMale = genderStr?.toLowerCase() === "male" || genderStr?.toLowerCase() === "m";
      const heShe = isFemale ? "She" : isMale ? "He" : "They";
      const hisHer = isFemale ? "her" : isMale ? "his" : "their";

      let remark = "";
      const matchedGrade = (gradingRows as any[])?.find((g: any) => avg >= Number(g.minimum_score) && avg <= Number(g.maximum_score));

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
        let perf = "";
        if (avg >= 80) perf = "an excellent result";
        else if (avg >= 70) perf = "a very good result";
        else if (avg >= 60) perf = "a good result";
        else if (avg >= 50) perf = "an average result";
        else perf = "a poor result. " + heShe + " can do better";
        remark = `${firstName} had ${perf}.`;
      }

      principalRemarks.push({ student_id: s.id, comment: remark });
    }

    // Save principal remarks — only for students that don't already have manual remarks
    if (principalRemarks.length > 0) {
      const { data: existingManual } = await supabase
        .from("school_admin_comments").select("student_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds);
      const manualIds = new Set((existingManual || []).map((e: any) => e.student_id));

      const toInsert = principalRemarks.filter(r => !manualIds.has(r.student_id));
      if (toInsert.length > 0) {
        await supabase.from("school_admin_comments").upsert(
          toInsert.map(r => ({
            school_id, student_id: r.student_id, term_id, comment: r.comment,
          })),
          { onConflict: "student_id,term_id" }
        );
      }
    }
  } catch (genErr: any) {
    console.error("[submit] Failed to auto-generate principal remarks:", genErr.message);
    // Non-fatal — submission still succeeds
  }

  return NextResponse.json({ success: true, status: "pending_approval" });
}
