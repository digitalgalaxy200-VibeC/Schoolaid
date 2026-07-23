import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Helper: extract name from Supabase join result (array or object)
const getName = (obj: any, field = "name") => {
  if (Array.isArray(obj)) return obj[0]?.[field] || "Unknown";
  return obj?.[field] || "Unknown";
};

// GET — load all report card data for a class
export async function GET(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Verify teacher is class teacher for this class
  const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const { data: classTeacher } = await supabase.from("class_teachers")
    .select("role").eq("school_id", school_id).eq("class_id", classId).eq("teacher_id", teacher.id).eq("is_active", true).maybeSingle();

  if (!classTeacher) return NextResponse.json({ error: "You are not the class teacher for this class" }, { status: 403 });

  // Active term
  const { data: activeTerm } = await supabase.from("academic_terms")
    .select("id, name, session_id").eq("school_id", school_id).eq("is_active", true).maybeSingle();
  if (!activeTerm) return NextResponse.json({ error: "No active term" }, { status: 400 });

  let sessionName = "";
  if (activeTerm.session_id) {
    const { data: session } = await supabase.from("academic_sessions").select("name").eq("id", activeTerm.session_id).single();
    sessionName = session?.name || "";
  }

  // Students
  const { data: students } = await supabase.from("students")
    .select("id, student_id, profiles(full_name), date_of_birth, gender, photo_url")
    .eq("school_id", school_id).eq("class_id", classId).order("student_id");

  const studentIds = (students || []).map((s) => s.id);

  // Components
  let components: any[] = [];
  const { data: classTemplate } = await supabase.from("class_components_templates")
    .select("template_id").eq("class_id", classId).maybeSingle();
  const templateId = classTemplate?.template_id;
  if (templateId) {
    const { data: rows } = await supabase.from("components_rows").select("*").eq("template_id", templateId).order("display_order");
    components = rows || [];
  }
  if (!components.length) {
    const { data: st } = await supabase.from("components_templates").select("id").eq("school_id", school_id).limit(1).maybeSingle();
    if (st?.id) {
      const { data: rows } = await supabase.from("components_rows").select("*").eq("template_id", st.id).order("display_order");
      components = rows || [];
    }
  }

  // All scores for these students in active term
  const { data: allScores } = await supabase.from("student_scores")
    .select("student_id, component_id, subject_id, score")
    .eq("school_id", school_id).eq("term_id", activeTerm.id)
    .in("student_id", studentIds.length ? studentIds : ["none"])
    .not("subject_id", "is", null);

  // Class subjects
  const { data: classSubjects } = await supabase.from("class_subjects")
    .select("subject_id, subjects(id, name)").eq("school_id", school_id).eq("class_id", classId).eq("is_active", true);

  // Grading template
  const { data: gradingTemplate } = await supabase.from("class_grading_templates")
    .select("template_id").eq("class_id", classId).maybeSingle();
  let gradingRows: any[] = [];
  if (gradingTemplate?.template_id) {
    const { data: gr } = await supabase.from("grading_rows").select("*").eq("template_id", gradingTemplate.template_id).order("minimum_score", { ascending: false });
    gradingRows = gr || [];
  }

  // Attendance
  const { data: attendance } = await supabase.from("attendance_records")
    .select("*").eq("school_id", school_id).eq("term_id", activeTerm.id)
    .in("student_id", studentIds.length ? studentIds : ["none"]);

  // Psychomotor
  const { data: psychomotorTemplate } = await supabase.from("class_psychomotor_templates")
    .select("template_id").eq("class_id", classId).maybeSingle();
  let psychomotorTraits: any[] = [];
  let psychomotorScores: any[] = [];
  if (psychomotorTemplate?.template_id) {
    const { data: pt } = await supabase.from("psychomotor_rows").select("*").eq("template_id", psychomotorTemplate.template_id).order("display_order");
    psychomotorTraits = pt || [];
    if (psychomotorTraits.length) {
      const traitIds = psychomotorTraits.map((t) => t.id);
      const { data: ps } = await supabase.from("psychomotor_scores")
        .select("*").eq("school_id", school_id).eq("term_id", activeTerm.id)
        .in("student_id", studentIds.length ? studentIds : ["none"])
        .in("trait_id", traitIds);
      psychomotorScores = ps || [];
    }
  }

  // Affective
  const { data: affectiveTemplate } = await supabase.from("class_affective_templates")
    .select("template_id").eq("class_id", classId).maybeSingle();
  let affectiveTraits: any[] = [];
  let affectiveScores: any[] = [];
  if (affectiveTemplate?.template_id) {
    const { data: at } = await supabase.from("affective_rows").select("*").eq("template_id", affectiveTemplate.template_id).order("display_order");
    affectiveTraits = at || [];
    if (affectiveTraits.length) {
      const traitIds = affectiveTraits.map((t) => t.id);
      const { data: as_ } = await supabase.from("affective_scores")
        .select("*").eq("school_id", school_id).eq("term_id", activeTerm.id)
        .in("student_id", studentIds.length ? studentIds : ["none"])
        .in("trait_id", traitIds);
      affectiveScores = as_ || [];
    }
  }

  // Teacher comments
  const { data: comments } = await supabase.from("teacher_comments")
    .select("*").eq("school_id", school_id).eq("term_id", activeTerm.id)
    .in("student_id", studentIds.length ? studentIds : ["none"]);

  // Principal comments
  const { data: principalComments } = await supabase.from("school_admin_comments")
    .select("*").eq("school_id", school_id).eq("term_id", activeTerm.id)
    .in("student_id", studentIds.length ? studentIds : ["none"]);

  // School info
  const { data: school } = await supabase.from("schools").select("name, logo_url, motto").eq("id", school_id).single();

  // Build per-student academic summary
  const studentSummaries = (students || []).map((stu) => {
    const stuScores = (allScores || []).filter((s) => s.student_id === stu.id);
    const subjectTotals: Record<string, { subjectId: string; subjectName: string; total: number; maxTotal: number }> = {};

    for (const score of stuScores) {
      if (!score.subject_id) continue;
      if (!subjectTotals[score.subject_id]) {
        const cs = (classSubjects || []).find((c) => c.subject_id === score.subject_id);
        const compTotal = components.reduce((sum, c) => sum + (c.maximum_score || 0), 0);
        subjectTotals[score.subject_id] = {
          subjectId: score.subject_id,
          subjectName: getName(cs?.subjects),
          total: 0,
          maxTotal: compTotal,
        };
      }
      subjectTotals[score.subject_id].total += score.score || 0;
    }

    const subjects = Object.values(subjectTotals);
    const grandTotal = subjects.reduce((sum, s) => sum + s.total, 0);
    const maxGrandTotal = subjects.reduce((sum, s) => sum + s.maxTotal, 0);
    const average = subjects.length > 0 ? grandTotal / subjects.length : 0;

    // Grade
    let grade = "-";
    if (gradingRows.length > 0) {
      const matched = gradingRows.find((g) => average >= g.minimum_score && average <= g.maximum_score);
      if (matched) grade = matched.grade;
    }

    // Attendance
    const att = (attendance || []).find((a) => a.student_id === stu.id);

    // Psychomotor
    const psy = psychomotorTraits.map((t) => {
      const s = (psychomotorScores || []).find((ps) => ps.student_id === stu.id && ps.trait_id === t.id);
      return { traitId: t.id, traitName: t.name, score: s?.score ?? null };
    });

    // Affective
    const aff = affectiveTraits.map((t) => {
      const s = (affectiveScores || []).find((as_) => as_.student_id === stu.id && as_.trait_id === t.id);
      return { traitId: t.id, traitName: t.name, score: s?.score ?? null };
    });

    // Comment
    const comment = (comments || []).find((c) => c.student_id === stu.id);
    const principalComment = (principalComments || []).find((c) => c.student_id === stu.id);

    return {
      studentId: stu.id,
      admissionNo: stu.student_id,
      name: getName(stu.profiles, "full_name"),
      dob: stu.date_of_birth,
      gender: stu.gender,
      photoUrl: stu.photo_url,
      subjects,
      grandTotal,
      maxGrandTotal,
      average,
      grade,
      attendance: att ? { daysOpened: att.days_school_opened, daysPresent: att.days_present, daysAbsent: att.days_absent } : null,
      psychomotor: psy,
      affective: aff,
      teacherComment: comment?.comment || "",
      principalComment: principalComment?.comment || "",
    };
  });

  return NextResponse.json({
    school: school || null,
    sessionName,
    activeTerm: { id: activeTerm.id, name: activeTerm.name },
    className: ((await supabase.from("classes").select("name").eq("id", classId).single()).data as any)?.name || "",
    components: components.map((c) => ({ id: c.id, name: c.name, maximum_score: c.maximum_score })),
    classSubjects: (classSubjects || []).map((cs) => ({ id: cs.subject_id, name: getName(cs.subjects) })),
    gradingRows,
    psychomotorTraits,
    affectiveTraits,
    students: studentSummaries,
  });
}

// POST — save attendance, psychomotor, affective, teacher comment
export async function POST(request: Request) {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json();
  const { type, data } = body;

  if (type === "attendance") {
    const { student_id, term_id, days_school_opened, days_present } = data;
    if (!student_id || !term_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const days_absent = Math.max(0, (days_school_opened || 0) - (days_present || 0));
    const { error } = await supabase.from("attendance_records").upsert(
      { school_id, student_id, term_id, days_school_opened, days_present, days_absent },
      { onConflict: "student_id,term_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, days_absent });
  }

  if (type === "psychomotor") {
    const { student_id, trait_id, term_id, score } = data;
    const { error } = await supabase.from("psychomotor_scores").upsert(
      { school_id, student_id, trait_id, term_id, score },
      { onConflict: "student_id,trait_id,term_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (type === "affective") {
    const { student_id, trait_id, term_id, score } = data;
    const { error } = await supabase.from("affective_scores").upsert(
      { school_id, student_id, trait_id, term_id, score },
      { onConflict: "student_id,trait_id,term_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (type === "comment") {
    const { student_id, term_id, comment } = data;
    const { error } = await supabase.from("teacher_comments").upsert(
      { school_id, student_id, term_id, comment },
      { onConflict: "student_id,term_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
