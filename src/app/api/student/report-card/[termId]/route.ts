import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { isTermApprovedForStudent } from "@/lib/report-card";

/**
 * Returns the complete published report card for a specific term.
 * Reads strictly from `term_results` snapshot (never live computation).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { termId } = await params;

  const supabase = getServiceClient();

  // Find the student
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, student_id, class_id, photo_url, gender, date_of_birth, classes(name), profiles(full_name)")
    .eq("profile_id", userId)
    .single();

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // The class teacher's report card for this term must be School-Admin-approved
  // before any of it (even already-"published" subject scores) is exposed.
  const { approved } = await isTermApprovedForStudent(student.id, termId);
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
    { data: gradingScalesRaw },
    { data: psychoDefs },
    { data: affectiveDefs },
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
      .select("comment")
      .eq("student_id", student.id)
      .eq("term_id", termId)
      .maybeSingle(),
    supabase
      .from("grading_scales")
      .select("grade, remark, minimum_score, maximum_score, principal_remark")
      .eq("school_id", school_id)
      .order("minimum_score", { ascending: false }),
    supabase
      .from("psychomotor_definitions")
      .select("id, name")
      .eq("school_id", school_id)
      .order("display_order"),
    supabase
      .from("affective_definitions")
      .select("id, name")
      .eq("school_id", school_id)
      .order("display_order"),
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

  // Build psychomotor/affective with labels
  const psychomotorItems = (psychomotor || []).map((p) => {
    const def = (psychoDefs || []).find((d) => d.id === p.trait_id);
    return { name: def?.name || "Unknown", score: p.score };
  });

  const affectiveItems = (affective || []).map((a) => {
    const def = (affectiveDefs || []).find((d) => d.id === a.trait_id);
    return { name: def?.name || "Unknown", score: a.score };
  });

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

  // Calculate Average & Compile Automated Principal Remark
  const gradingScales = gradingScalesRaw as Array<{ grade: string; remark: string; minimum_score: number; maximum_score: number; principal_remark?: string | null }>;
  let compiledAdminComment = adminComment?.comment || null;
  const offeredCount = (termResults || []).filter(r => r.total_score !== null && Number(r.total_score) > 0).length;
  if (offeredCount > 0 && gradingScales && gradingScales.length > 0) {
    const totalScoreSum = (termResults || []).reduce((acc, r) => acc + (Number(r.total_score) || 0), 0);
    const average = totalScoreSum / offeredCount;
    const matchedGrade = gradingScales.find((g) => average >= Number(g.minimum_score) && average <= Number(g.maximum_score));
    
    if (matchedGrade && matchedGrade.principal_remark) {
      let remarkTemplate = matchedGrade.principal_remark;
      const studentProfile = student.profiles as any;
      const fName = studentProfile?.full_name?.split(" ")[0] || "The student";
      const isFemale = student.gender?.toLowerCase() === "female" || student.gender?.toLowerCase() === "f";
      const isMale = student.gender?.toLowerCase() === "male" || student.gender?.toLowerCase() === "m";
      
      const heShe = isFemale ? "She" : isMale ? "He" : "They";
      const heSheLower = isFemale ? "she" : isMale ? "he" : "they";
      const hisHer = isFemale ? "Her" : isMale ? "His" : "Their";
      const hisHerLower = isFemale ? "her" : isMale ? "his" : "their";
      const himHerLower = isFemale ? "her" : isMale ? "him" : "them";
      
      remarkTemplate = remarkTemplate.replace(/{name}/gi, fName);
      remarkTemplate = remarkTemplate.replace(/{average}/gi, average.toFixed(1));
      remarkTemplate = remarkTemplate.replace(/{grade}/gi, matchedGrade.grade);
      remarkTemplate = remarkTemplate.replace(/{he\/she}/g, heSheLower);
      remarkTemplate = remarkTemplate.replace(/{He\/She}/g, heShe);
      remarkTemplate = remarkTemplate.replace(/{his\/her}/gi, hisHerLower);
      remarkTemplate = remarkTemplate.replace(/{His\/Her}/g, hisHer);
      remarkTemplate = remarkTemplate.replace(/{him\/her}/gi, himHerLower);
      
      compiledAdminComment = remarkTemplate;
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
    position,
    totalStudents,
    results: termResults || [],
    component_scores: componentsData || [],
    attendance: attendance || null,
    psychomotor: psychomotorItems,
    affective: affectiveItems,
    teacher_comment: teacherComment?.comment || null,
    admin_comment: compiledAdminComment,
    grading_scales: gradingScales || [],
    settings: settings || null,
    has_results: (termResults || []).length > 0,
  });
}
