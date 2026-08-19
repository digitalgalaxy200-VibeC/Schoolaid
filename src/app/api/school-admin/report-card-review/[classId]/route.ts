import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm, resolveTemplateRows } from "@/lib/report-card";

export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { classId } = await params;

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });

  const supabase = getServiceClient();

  const { data: cls } = await supabase.from("classes").select("id, name, grade_level").eq("school_id", school_id).eq("id", classId).maybeSingle();
  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, student_id, photo_url, profiles!inner(full_name, is_active)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("profiles.is_active", true);
  const students = (studentsRaw || [])
    .map((s: any) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return { id: s.id, admission_no: s.student_id || "", name: p?.full_name || "Unknown", photo_url: s.photo_url || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const studentIds = students.map((s) => s.id);

  const { data: classSubjects } = await supabase
    .from("class_subjects")
    .select("subject_id, subjects(name)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("is_active", true);
  const subjects = (classSubjects || []).map((cs: any) => {
    const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
    return { id: cs.subject_id, name: subj?.name || "Unknown" };
  });

  const [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
    resolveTemplateRows(school_id, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, classId, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  let scores: any[] = [], attendance: any[] = [], psychomotorScores: any[] = [], affectiveScores: any[] = [], comments: any[] = [], adminComments: any[] = [];
  if (studentIds.length > 0) {
    const [scoresQ, attendanceQ, psychoQ, affQ, commentsQ, adminQ] = await Promise.all([
      supabase.from("student_scores").select("student_id, subject_id, component_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("attendance_records").select("student_id, days_school_opened, days_present, days_absent").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("psychomotor_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("affective_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
      supabase.from("school_admin_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
    ]);
    scores = scoresQ.data || [];
    attendance = attendanceQ.data || [];
    psychomotorScores = psychoQ.data || [];
    affectiveScores = affQ.data || [];
    comments = commentsQ.data || [];
    adminComments = adminQ.data || [];
  }

  const [{ data: submission }, { data: settings }, { data: school }] = await Promise.all([
    supabase.from("report_card_submissions").select("status, submitted_at, submitted_by, reviewed_at, reviewed_by, return_reason").eq("class_id", classId).eq("term_id", activeTerm.id).maybeSingle(),
    supabase.from("report_card_settings").select("*").eq("school_id", school_id).maybeSingle(),
    supabase.from("schools").select("name, logo_url, address, email, phone, motto").eq("id", school_id).single(),
  ]);

  let submittedByName: string | null = null;
  if (submission?.submitted_by) {
    const { data: p } = await supabase.from("profiles").select("full_name").eq("id", submission.submitted_by).maybeSingle();
    submittedByName = p?.full_name || null;
  }

  return NextResponse.json({
    class: { id: cls.id, name: cls.name, grade: cls.grade_level },
    activeTerm,
    students,
    subjects,
    components: components.map((c: any) => ({ id: c.id, name: c.name, maximum_score: c.maximum_score, order: c.display_order || 0 })),
    gradingRows: gradingRows.map((g: any) => ({ grade: g.grade, minimum_score: g.minimum_score, maximum_score: g.maximum_score, remark: g.remark })),
    psychomotorTraits: psychomotorTraits.map((t: any) => ({ id: t.id, name: t.name })),
    affectiveTraits: affectiveTraits.map((t: any) => ({ id: t.id, name: t.name })),
    scores,
    attendance,
    psychomotorScores,
    affectiveScores,
    comments,
    adminComments,
    submission: submission ? { ...submission, submittedByName } : { status: "draft" },
    settings: settings || null,
    school: school || null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { classId } = await params;
  const { action, return_reason, retraction_reason } = await request.json();
  if (!["approve", "return", "publish", "retract", "republish"].includes(action))
    return NextResponse.json({ error: "action must be approve, return, publish, retract, or republish" }, { status: 400 });
  if (action === "return" && !String(return_reason || "").trim()) return NextResponse.json({ error: "return_reason is required" }, { status: 400 });
  if (action === "retract" && !String(retraction_reason || "").trim()) return NextResponse.json({ error: "retraction_reason is required" }, { status: 400 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  const { data: submission } = await supabase
    .from("report_card_submissions").select("status").eq("class_id", classId).eq("term_id", term_id).maybeSingle();
  if (action === "approve" && !["pending_approval", "approved"].includes(submission?.status || ""))
    return NextResponse.json({ error: "Only classes pending approval can be approved" }, { status: 409 });
  if (action === "return" && submission?.status !== "pending_approval")
    return NextResponse.json({ error: "Only classes pending approval can be returned" }, { status: 409 });
  if (action === "publish" && submission?.status !== "approved")
    return NextResponse.json({ error: "Only approved classes can be published" }, { status: 409 });
  if (action === "retract" && submission?.status !== "published")
    return NextResponse.json({ error: "Only published classes can be retracted" }, { status: 409 });
  if (action === "republish" && submission?.status !== "retracted")
    return NextResponse.json({ error: "Only retracted classes can be republished" }, { status: 409 });

  const now = new Date().toISOString();

  if (action === "return") {
    const { error } = await supabase.from("report_card_submissions").update({
      status: "returned", reviewed_by: userId, reviewed_at: now, return_reason: String(return_reason).trim(),
    }).eq("class_id", classId).eq("term_id", term_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id: classId, term_id, user_id: userId, action: "return", details: { reason: String(return_reason).trim() },
    });
    return NextResponse.json({ success: true, status: "returned" });
  }

  // ── action === "publish": make approved results visible to students ──
  if (action === "publish") {

    const { error } = await supabase.from("report_card_submissions").update({
      status: "published", published_by: userId, published_at: now,
    }).eq("class_id", classId).eq("term_id", term_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id: classId, term_id, user_id: userId, action: "publish",
    });
    return NextResponse.json({ success: true, status: "published" });
  }

  // ── action === "retract": hide published results from students ──
  if (action === "retract") {
    if (submission?.status !== "published")
      return NextResponse.json({ error: "Only published classes can be retracted" }, { status: 409 });

    const reason = String(retraction_reason || "").trim();
    const { error } = await supabase.from("report_card_submissions").update({
      status: "retracted", retracted_by: userId, retracted_at: now, retraction_reason: reason,
    }).eq("class_id", classId).eq("term_id", term_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id: classId, term_id, user_id: userId, action: "retract", details: { reason },
    });
    return NextResponse.json({ success: true, status: "retracted" });
  }

  // ── action === "republish": restore retracted results to published ──
  if (action === "republish") {
    if (submission?.status !== "retracted")
      return NextResponse.json({ error: "Only retracted classes can be republished" }, { status: 409 });

    const { error } = await supabase.from("report_card_submissions").update({
      status: "published", published_by: userId, published_at: now, retracted_by: null, retracted_at: null, retraction_reason: null,
    }).eq("class_id", classId).eq("term_id", term_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id: classId, term_id, user_id: userId, action: "republish",
    });
    return NextResponse.json({ success: true, status: "published" });
  }

  // ── action === "approve": recompute + publish term_results for every student × subject ──
  const { data: studentsRaw } = await supabase.from("students").select("id").eq("school_id", school_id).eq("class_id", classId);
  const studentIds = (studentsRaw || []).map((s) => s.id);
  const { data: classSubjects } = await supabase
    .from("class_subjects").select("subject_id").eq("school_id", school_id).eq("class_id", classId).eq("is_active", true);
  const subjectIds = (classSubjects || []).map((cs) => cs.subject_id);

  if (studentIds.length === 0 || subjectIds.length === 0)
    return NextResponse.json({ error: "Class has no students or no subjects to publish" }, { status: 400 });

  const [components, gradingRows] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
  ]);
  const maxTotal = components.reduce((sum, c: any) => sum + (Number(c.maximum_score) || 0), 0);

  const { data: scores } = await supabase
    .from("student_scores").select("student_id, subject_id, component_id, score").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds);

  const { data: existingResults } = await supabase
    .from("term_results").select("*").eq("term_id", term_id).in("student_id", studentIds).in("subject_id", subjectIds);
  const existingMap = new Map((existingResults || []).map((r) => [`${r.student_id}|${r.subject_id}`, r]));

  const editLogs: Record<string, unknown>[] = [];
  const upserts: Record<string, unknown>[] = [];
  const componentUpserts: Record<string, unknown>[] = [];
  const deleteIds: string[] = [];
  
  for (const student_id of studentIds) {
    for (const subject_id of subjectIds) {
      const rows = (scores || []).filter((s) => s.student_id === student_id && s.subject_id === subject_id);
      const existing = existingMap.get(`${student_id}|${subject_id}`);

      if (rows.length === 0) {
        if (existing) deleteIds.push(existing.id);
        continue;
      }

      const total = rows.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
      const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
      const gradeRow = (gradingRows as any[]).find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score));
      const gradeLetter = gradeRow?.grade || "N/A";

      if (existing?.published) {
        editLogs.push({
          student_id, term_id, subject_id, edited_by: userId,
          previous_grade: existing.grade, new_grade: gradeLetter,
          previous_total: existing.total_score, new_total: total,
        });
      }

      upserts.push({
        school_id, class_id: classId, student_id, term_id, subject_id,
        total_score: total, grade: gradeLetter, remark: gradeRow?.remark || "",
        published: true, published_by: existing?.published_by || userId,
        published_at: existing?.published_at || now,
        last_edited_at: existing?.published ? now : null,
      });

      // Snapshot individual components
      for (const comp of components as any[]) {
        const compScoreRow = rows.find((r) => r.component_id === comp.id);
        if (compScoreRow) {
          componentUpserts.push({
            school_id, student_id, term_id, subject_id,
            component_id: comp.id,
            component_name: comp.name,
            component_order: comp.display_order || 0,
            max_score: Number(comp.maximum_score) || 0,
            score: Number(compScoreRow.score) || 0,
          });
        }
      }
    }
  }

  const { error: upsertError } = await supabase.from("term_results").upsert(upserts, { onConflict: "student_id,term_id,subject_id" });
  if (upsertError) return NextResponse.json({ error: "Failed to publish term results: " + upsertError.message }, { status: 500 });

  if (deleteIds.length > 0) {
    await supabase.from("term_results").delete().in("id", deleteIds);
  }
  
  if (componentUpserts.length > 0) {
    const { error: compError } = await supabase.from("term_result_components").upsert(componentUpserts, { onConflict: "student_id,term_id,subject_id,component_id" });
    if (compError) return NextResponse.json({ error: compError.message }, { status: 500 });
  }

  if (editLogs.length > 0) await supabase.from("result_edit_logs").insert(editLogs);

  // ── Auto-generate principal remarks for students without manual comments ──
  const { data: existingAdminComments } = await supabase.from("school_admin_comments")
    .select("student_id, is_manual").eq("school_id", school_id).eq("term_id", term_id)
    .in("student_id", studentIds);
  const manualCommentStudents = new Set((existingAdminComments || []).filter(c => c.is_manual).map(c => c.student_id));

  const hasGradingRows = (gradingRows as any[])?.length > 0;

  const principalUpserts: Record<string, unknown>[] = [];
  for (const student_id of studentIds) {
    if (manualCommentStudents.has(student_id)) continue; // skip if admin wrote a manual comment
    
    const studentScores = (scores || []).filter(s => s.student_id === student_id && s.subject_id);
    if (studentScores.length === 0) continue;
    
    // A subject is "offered" only when its total is between 1 and 100.
    const totalsBySubject = new Map<string, number>();
    for (const s of studentScores) {
      totalsBySubject.set(s.subject_id, (totalsBySubject.get(s.subject_id) || 0) + Number(s.score || 0));
    }
    const offeredTotals = Array.from(totalsBySubject.values()).filter(t => t >= 1 && t <= 100);
    const average = offeredTotals.length > 0
      ? offeredTotals.reduce((a, b) => a + b, 0) / offeredTotals.length
      : 0;
    
    // Get student info for personalization
    const { data: stu } = await supabase.from("students").select("gender, profiles(full_name)").eq("id", student_id).single();
    const profile = stu?.profiles as any;
    const fName = profile?.full_name?.split(" ")[0] || "The student";
    const isFemale = stu?.gender?.toLowerCase() === "female";
    const isMale = stu?.gender?.toLowerCase() === "male";
    const heShe = isFemale ? "She" : isMale ? "He" : "They";
    const hisHer = isFemale ? "her" : isMale ? "his" : "their";
    
    let remark = "";
    const matchedGrade = hasGradingRows
      ? (gradingRows as any[]).find((g: any) => average >= Number(g.minimum_score) && average <= Number(g.maximum_score))
      : undefined;

    if (matchedGrade?.principal_remark) {
      remark = matchedGrade.principal_remark
        .replace(/{name}/gi, fName)
        .replace(/{average}/gi, average.toFixed(1))
        .replace(/{grade}/gi, matchedGrade.grade)
        .replace(/{He\/She}/g, heShe)
        .replace(/{he\/she}/g, heShe.toLowerCase())
        .replace(/{his\/her}/gi, hisHer)
        .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
        .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
    } else if (matchedGrade) {
      const descriptor = (matchedGrade.remark || "satisfactory").toLowerCase();
      const article = /^[aeiou]/i.test(descriptor) ? "an" : "a";
      remark = `${fName} had ${article} ${descriptor} result.`;
    } else if (!hasGradingRows) {
      let perf = "";
      if (average >= 80) perf = "an excellent result";
      else if (average >= 70) perf = "a very good result";
      else if (average >= 60) perf = "a good result";
      else if (average >= 50) perf = "an average result";
      else perf = "a poor result. " + heShe + " can do better";
      remark = `${fName} had ${perf}.`;
    } else {
      remark = `${fName} had a satisfactory result.`;
    }

    principalUpserts.push({ school_id, student_id, term_id, comment: remark, is_manual: false });
  }
  
  if (principalUpserts.length > 0) {
    await supabase.from("school_admin_comments").upsert(principalUpserts, { onConflict: "student_id,term_id" });
  }

  const { error: subError } = await supabase.from("report_card_submissions").update({
    status: "published", reviewed_by: userId, reviewed_at: now, published_by: userId, published_at: now,
  }).eq("class_id", classId).eq("term_id", term_id);
  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id: classId, term_id, user_id: userId, action: "approve",
    details: { students: studentIds.length, subjects: subjectIds.length },
  });

  return NextResponse.json({ success: true, status: "published" });
}
