import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { isTermApprovedForStudent, isTermRetractedForStudent, resolveTemplateRows } from "@/lib/report-card";
import { readConfigurationSnapshot, resolveCardConfiguration } from "@/lib/report-card-snapshot";

/** One row of a grading key, whether the live table or a publication snapshot supplied it. */
type GradingScaleRow = {
  grade: string;
  remark: string | null;
  minimum_score: number;
  maximum_score: number;
  principal_remark?: string | null;
};

/**
 * Returns the complete published report card for a specific term.
 * Reads strictly from `term_results` snapshot (never live computation).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { termId } = await params;

  const supabase = getServiceClient();

  // Find the student
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, student_id, class_id, photo_url, gender, date_of_birth, classes(name), profiles(full_name)")
    .eq("profile_id", userId)
    .single();

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Check if results are retracted
  const { retracted, reason } = await isTermRetractedForStudent(student.id, termId);
  if (retracted) {
    return NextResponse.json({
      student: { admission_number: student.student_id },
      school: {}, session: "", term: "", results: [], attendance: null,
      psychomotor: [], affective: [], teacher_comment: null, admin_comment: null,
      grading_scales: [], has_results: false, is_retracted: true, retraction_reason: reason,
    });
  }

  // The class submission must be published. `classId` is the class that published the
  // frozen results — not the student's current class, which differs after a promotion.
  const { approved, classId: publishedClassId } = await isTermApprovedForStudent(student.id, termId);
  if (!approved) {
    return NextResponse.json({
      student: { admission_number: student.student_id },
      school: {}, session: "", term: "", results: [], attendance: null,
      psychomotor: [], affective: [], teacher_comment: null, admin_comment: null,
      grading_scales: [], has_results: false,
    });
  }

  // Fetch everything in parallel
  const [
    { data: termResults },
    { data: attendance },
    { data: psychomotor },
    { data: affective },
    { data: teacherComment },
    { data: adminComment },
    { data: school },
    { data: term },
    { data: componentsData },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("term_results")
      .select("id, subject_id, total_score, grade, remark, last_edited_at, subjects(name)")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .eq("published", true),
    supabase
      .from("attendance_records")
      .select("days_school_opened, days_present, days_absent")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("psychomotor_scores")
      .select("trait_id, score")
      .eq("student_id", student.id)
      .eq("term_id", termId),
    supabase
      .from("affective_scores")
      .select("trait_id, score")
      .eq("student_id", student.id)
      .eq("term_id", termId),
    supabase
      .from("teacher_comments")
      .select("comment")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("school_admin_comments")
      .select("comment, is_manual")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("schools")
      .select("name, logo_url, address, phone, email, motto")
      .eq("id", school_id)
      .single(),
    supabase
      .from("academic_terms")
      .select("name, session_id")
      .eq("id", termId)
      .single(),
    supabase
      .from("term_result_components")
      .select("subject_id, component_id, component_name, component_order, max_score, score")
      .eq("student_id", student.id)
      .eq("term_id", termId),
    supabase
      .from("report_card_settings")
      .select("*")
      .eq("school_id", school_id)
      .maybeSingle(),
  ]);

  // Phase 11: templates are resolved for the class that PUBLISHED this card. Using the
  // student's current class meant a promoted student's old report card re-rendered
  // itself against the new class's components and grading bands.
  const classId = publishedClassId ?? student.class_id ?? "";
  const [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
    resolveTemplateRows(school_id, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, classId, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  // Phase 11: the configuration this card was published with. Present for every card
  // published since snapshots exist; NULL for older ones, which keep rendering from the
  // live templates exactly as they did before.
  const configurationSnapshot = await readConfigurationSnapshot(supabase, school_id, classId, termId);

  // Get session name
  let sessionName = "";
  if (term?.session_id) {
    const { data: sess } = await supabase
      .from("academic_sessions")
      .select("name")
      .eq("id", term.session_id)
      .single();
    sessionName = sess?.name || "";
  }

  // Calculate position if class_id exists and setting allows it
  let position: number | null = null;
  let totalStudents = 0;
  if (student.class_id) {
    const { data: classStudents } = await supabase.from("students").select("id").eq("class_id", student.class_id);
    const classStudentIds = (classStudents || []).map(s => s.id);
    totalStudents = classStudentIds.length;
    
    if (classStudentIds.length > 0) {
      const { data: classResults } = await supabase.from("term_results").select("student_id, total_score").eq("term_id", termId).in("student_id", classStudentIds);
      
      const studentTotals = new Map<string, number>();
      for (const r of classResults || []) {
        studentTotals.set(r.student_id, (studentTotals.get(r.student_id) || 0) + Number(r.total_score));
      }
      
      const sorted = Array.from(studentTotals.entries()).sort((a, b) => b[1] - a[1]);
      let currentRank = 1;
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i][1] < sorted[i-1][1]) {
          currentRank = i + 1;
        }
        if (sorted[i][0] === student.id) {
          position = currentRank;
          break;
        }
      }
    }
  }

  // ── Phase 11: snapshot first, live only as a fallback ──
  // A published card renders from the configuration it was published with. The school
  // changing its "A" band, renaming a component or replacing a psychomotor trait must
  // not rewrite a report card that has already been issued.
  const card = resolveCardConfiguration({
    studentId: student.id,
    snapshot: configurationSnapshot,
    live: {
      components: components || [],
      gradingScale: gradingRows || [],
      psychomotorTraits: psychomotorTraits || [],
      affectiveTraits: affectiveTraits || [],
      settings: settings ?? null,
      position,
      classSize: totalStudents,
    },
  });

  // Position and class size are part of the published record: a student joining the class
  // later must not turn "5th of 32" into "5th of 35".
  const cardComponents = card.components;
  const cardPosition = card.position;
  const cardClassSize = card.classSize;

  const gradingScales: GradingScaleRow[] = [...(card.gradingScale as GradingScaleRow[])].sort(
    (a, b) => Number(b.minimum_score) - Number(a.minimum_score),
  );

  // Build psychomotor/affective with labels from the frozen traits
  const psychomotorItems = (card.psychomotorTraits as any[]).map((t) => {
    const s = (psychomotor || []).find((p) => p.trait_id === t.id);
    return { name: t.name || "Unknown", score: s ? s.score : 0 };
  });

  const affectiveItems = (card.affectiveTraits as any[]).map((t) => {
    const s = (affective || []).find((a) => a.trait_id === t.id);
    return { name: t.name || "Unknown", score: s ? s.score : 0 };
  });

  // Calculate Average & Compile Automated Principal Remark
  let compiledAdminComment = adminComment?.comment || null;
  const isManualComment = adminComment?.is_manual === true;

  // On a snapshotted card the STORED remark IS the frozen remark — re-deriving it from
  // today's grading bands is exactly the drift this phase removes. A card published
  // before snapshots existed (or one with no stored remark) compiles one below, from the
  // resolved grading scale.
  const hasFrozenRemark = card.source === "snapshot" && !!compiledAdminComment;

  const offeredTotals = (termResults || [])
    .map(r => Number(r.total_score) || 0)
    .filter(total => total >= 1 && total <= 100);
  const offeredCount = offeredTotals.length;
  if (offeredCount > 0 && !isManualComment && !hasFrozenRemark) {
    const average = offeredTotals.reduce((a, b) => a + b, 0) / offeredCount;
    const matchedGrade = gradingScales.length > 0
      ? gradingScales.find((g) => average >= Number(g.minimum_score) && average <= Number(g.maximum_score))
      : undefined;
    
    const studentProfile = student.profiles as any;
    const fName = studentProfile?.full_name?.split(" ")[0] || "The student";
    const isFemale = student.gender?.toLowerCase() === "female" || student.gender?.toLowerCase() === "f";
    const isMale = student.gender?.toLowerCase() === "male" || student.gender?.toLowerCase() === "m";
    const heShe = isFemale ? "She" : isMale ? "He" : "They";
    const hisHer = isFemale ? "her" : isMale ? "his" : "their";

    // Priority 1: Use principal_remark template if set on the grading row
    if (matchedGrade?.principal_remark) {
      let tpl = matchedGrade.principal_remark
        .replace(/{name}/gi, fName)
        .replace(/{average}/gi, average.toFixed(1))
        .replace(/{grade}/gi, matchedGrade.grade)
        .replace(/{He\/She}/g, heShe)
        .replace(/{he\/she}/g, heShe.toLowerCase())
        .replace(/{his\/her}/gi, hisHer)
        .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
        .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
      compiledAdminComment = tpl;
    } else if (matchedGrade) {
      const descriptor = (matchedGrade.remark || "satisfactory").toLowerCase();
      const article = /^[aeiou]/i.test(descriptor) ? "an" : "a";
      compiledAdminComment = `${fName} had ${article} ${descriptor} result.`;
    } else if (gradingScales.length === 0) {
      let remark = "";
      if (average >= 80) remark = "an excellent result";
      else if (average >= 70) remark = "a very good result";
      else if (average >= 60) remark = "a good result";
      else if (average >= 50) remark = "an average result";
      else remark = "a poor result. " + heShe + " can do better";
      compiledAdminComment = `${fName} had ${remark}.`;
    } else {
      compiledAdminComment = `${fName} had a satisfactory result.`;
    }
  }

  return NextResponse.json({
    student: {
      admission_number: student.student_id,
      photo_url: student.photo_url,
      gender: student.gender,
      dob: student.date_of_birth,
      class_name: Array.isArray((student as any).classes) ? (student as any).classes[0]?.name : (student as any).classes?.name,
    },
    school: school || {},
    session: sessionName,
    term: term?.name || "",
    position: cardPosition,
    totalStudents: cardClassSize,
    results: termResults || [],
    components: cardComponents,
    component_scores: componentsData || [],
    attendance: attendance || null,
    psychomotor: psychomotorItems,
    affective: affectiveItems,
    teacher_comment: teacherComment?.comment || null,
    admin_comment: compiledAdminComment,
    grading_scales: gradingScales || [],
    settings: card.settings || null,
    has_results: (termResults || []).length > 0,
  });
}
