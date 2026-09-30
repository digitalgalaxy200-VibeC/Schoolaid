import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySchoolOwnership, componentBelongsToSchool } from "@/lib/tenant-ownership";
import { readReportCardLock } from "@/lib/report-card";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records one score change. PD-3 requires the previous value, the new value, the
 * actor, the affected student/subject/component and the correction cycle that
 * authorised the change.
 *
 * Audit failures are logged but do not block the write: losing the ability to
 * record marks during a lesson would be worse than a gap in the trail, and the
 * underlying row change is still attributable via student_scores.updated_at.
 */
async function logScoreChange(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    actorId: string | null;
    action: "score_insert" | "score_update" | "score_delete";
    studentId: string;
    termId: string;
    subjectId: string | null;
    componentId: string | null;
    previousScore: number | null;
    newScore: number | null;
    cycleId: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("result_edit_logs").insert({
    school_id: args.schoolId,
    student_id: args.studentId,
    term_id: args.termId,
    subject_id: args.subjectId,
    component_id: args.componentId,
    edited_by: args.actorId,
    action: args.action,
    previous_score: args.previousScore,
    new_score: args.newScore,
    reason:
      args.reason ??
      (args.cycleId ? "correction during retraction window" : "score entry"),
    correction_cycle_id: args.cycleId,
  });

  if (error) console.error("[scores] audit write failed:", error.message);
}

export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const classId = searchParams.get("class_id");
  const subjectId = searchParams.get("subject_id");
  if (!termId || !classId) return NextResponse.json({ error: "term_id and class_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Ownership — only teachers of this class may read its roster/scores:
  // class teacher, or a subject assignment matching subject_id (like class-subjects route)
  if (!all_classes) {
    const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const { data: classTeacher } = await supabase.from("class_teachers").select("id").eq("school_id", school_id).eq("class_id", classId).eq("teacher_id", teacher.id).eq("is_active", true).maybeSingle();
    if (!classTeacher) {
      if (!subjectId) return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      const { data: assignment } = await supabase.from("teacher_subjects").select("id").eq("school_id", school_id).eq("teacher_id", teacher.id).eq("class_id", classId).eq("subject_id", subjectId).eq("is_active", true).limit(1).maybeSingle();
      if (!assignment) return NextResponse.json({ error: "You are not assigned to teach this subject in this class" }, { status: 403 });
    }
  }

  const { data: students } = await supabase.from("students").select("id, profiles!inner(full_name, is_active)").eq("school_id", school_id).eq("class_id", classId).eq("profiles.is_active", true);

  // Resolve assessment template for this class
  // Step 1: Look for a template directly linked to this class
  let components: any[] | null = null;
  const { data: classTemplate } = await supabase
    .from("class_components_templates")
    .select("template_id")
    .eq("class_id", classId)
    .maybeSingle();

  if (classTemplate?.template_id) {
    const { data: rows } = await supabase
      .from("components_rows")
      .select("*")
      .eq("template_id", classTemplate.template_id)
      .order("display_order");
    components = rows;
  }

  // Step 2: If no class-specific template found, use the school's first/only template
  if (!components || components.length === 0) {
    const { data: schoolTemplate } = await supabase
      .from("components_templates")
      .select("id")
      .eq("school_id", school_id)
      .limit(1)
      .maybeSingle();
    if (schoolTemplate?.id) {
      const { data: rows } = await supabase
        .from("components_rows")
        .select("*")
        .eq("template_id", schoolTemplate.id)
        .order("display_order");
      components = rows;
    }
  }

  // Get scores — filtered by the students in this class
  // We use student IDs (from the already-fetched students array) as a reliable
  // filter. This works with or without the class_id migration column.
  const studentIds = (students || []).map((s: any) => s.id);
  let scores: any[] = [];
  if (studentIds.length > 0) {
    let scoresQuery = supabase
      .from("student_scores")
      .select("*")
      .eq("school_id", school_id)
      .eq("term_id", termId)
      .in("student_id", studentIds);
    if (subjectId) scoresQuery = scoresQuery.eq("subject_id", subjectId);
    const { data: scoreData, error: scoreError } = await scoresQuery;
    if (scoreError) console.error("Score fetch error:", scoreError.message);
    scores = scoreData || [];
  }

  const normalizedScores = scores.map((s: any) => ({
    ...s,
    assessment_component_id: s.component_id || s.assessment_component_id,
  }));

  const normalizedComponents = (components || []).map((c: any) => ({
    id: c.id, name: c.name, maximum_score: c.maximum_score, display_order: c.display_order,
  }));

  return NextResponse.json({ students: students || [], components: normalizedComponents, scores: normalizedScores });
}

export async function POST(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  // Narrow `school_id` to a non-null string: every write below is tenant-scoped
  // and must never proceed without a resolved school.
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { type, data } = body;
  const supabase = getServiceClient();

  // Writes are only allowed for students in classes the caller teaches:
  // class teacher of the student's class, or subject assignment matching subject_id
  const ensureStudentAccess = async (student_id: string, subject_id?: string | null) => {
    if (all_classes) return null;
    if (!student_id) return NextResponse.json({ error: "student_id required" }, { status: 400 });
    const { data: student } = await supabase.from("students").select("class_id").eq("id", student_id).eq("school_id", school_id).maybeSingle();
    if (!student?.class_id) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    const { data: classTeacher } = await supabase.from("class_teachers").select("id").eq("school_id", school_id).eq("class_id", student.class_id).eq("teacher_id", teacher.id).eq("is_active", true).maybeSingle();
    if (classTeacher) return null;
    if (subject_id) {
      const { data: assignment } = await supabase.from("teacher_subjects").select("id").eq("school_id", school_id).eq("teacher_id", teacher.id).eq("class_id", student.class_id).eq("subject_id", subject_id).eq("is_active", true).limit(1).maybeSingle();
      if (assignment) return null;
    }
    return NextResponse.json({ error: "You can only enter scores for students in classes you teach" }, { status: 403 });
  };

  // Report-card lock (see readReportCardLock). Applied here for the non-score
  // request types; the score path re-checks it against the student's own class.
  if (data?.class_id && data?.term_id) {
    const lock = await readReportCardLock(supabase, school_id, data.class_id, data.term_id);
    if (lock.locked) {
      return NextResponse.json(
        { error: "These report cards are locked. A School Admin must retract them before marks can be changed." },
        { status: 423 },
      );
    }
  }

  if (type === "score") {
    const { student_id, assessment_component_id, term_id, score, subject_id, class_id } = data;
    const componentId = assessment_component_id;

    if (!componentId || !student_id || !term_id) {
      return NextResponse.json({ error: "student_id, assessment_component_id, and term_id are required" }, { status: 400 });
    }

    // Ownership gate before any write
    const denied = await ensureStudentAccess(student_id, subject_id);
    if (denied) return denied;

    // ── Foreign-key ownership ────────────────────────────────────────────────
    // A foreign key proves the referenced row exists, not that this school owns
    // it. Without this, a caller could attach their score to another school's
    // subject or term.
    const refs = await verifySchoolOwnership(supabase, school_id, [
      { table: "subjects", id: subject_id, label: "subject" },
      { table: "academic_terms", id: term_id, label: "term" },
    ]);
    if (!refs.ok) {
      return NextResponse.json(
        { error: `Invalid reference: ${refs.violations.join("; ")}` },
        { status: 400 },
      );
    }

    if (!(await componentBelongsToSchool(supabase, school_id, componentId))) {
      return NextResponse.json(
        { error: "Invalid reference: assessment component belongs to a different school" },
        { status: 400 },
      );
    }

    // ── Authoritative lock ──────────────────────────────────────────────────
    // Derived from the STUDENT's class, never from the request body, so the
    // lock cannot be sidestepped by sending a different class_id.
    const { data: studentRow } = await supabase
      .from("students")
      .select("class_id")
      .eq("id", student_id)
      .eq("school_id", school_id)
      .maybeSingle();

    const lock = await readReportCardLock(
      supabase,
      school_id,
      (studentRow?.class_id as string) ?? class_id ?? null,
      term_id,
    );

    if (lock.locked) {
      return NextResponse.json(
        {
          error:
            "These report cards are published and locked. A School Admin must " +
            "retract them, with a reason, before marks can be corrected.",
        },
        { status: 423 },
      );
    }

    // Check if a score already exists for this student + component + term + subject
    let query = supabase
      .from("student_scores")
      .select("id, score")
      .eq("school_id", school_id)
      .eq("student_id", student_id)
      .eq("component_id", componentId)
      .eq("term_id", term_id);
      
    if (subject_id) {
      query = query.eq("subject_id", subject_id);
    } else {
      query = query.is("subject_id", null);
    }

    const { data: existing, error: selectError } = await query.maybeSingle();

    if (selectError) {
      console.error("Score lookup error:", selectError.message);
      return NextResponse.json({ error: "Failed to lookup score" }, { status: 500 });
    }

    if (score === null || score === "") {
      // If score is empty, they are deleting it
      if (existing?.id) {
        const previousScore = existing.score ?? null;
        const { error } = await supabase.from("student_scores").delete().eq("id", existing.id).eq("school_id", school_id);
        if (error) {
          console.error("Score delete error:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logScoreChange(supabase, {
          schoolId: school_id,
          actorId: userId,
          action: "score_delete",
          studentId: student_id,
          termId: term_id,
          subjectId: subject_id ?? null,
          componentId,
          previousScore,
          newScore: null,
          cycleId: lock.cycleId,
        });
      }
      return NextResponse.json({ success: true });
    }

    const updates: Record<string, unknown> = { score: score };
    if (subject_id) updates.subject_id = subject_id;
    // `student_scores.class_id` exists on staging (migration 015 is applied —
    // verified against the live schema), so score rows are kept aligned to the
    // class they were entered for.
    if (class_id) updates.class_id = class_id;

    if (existing?.id) {
      // UPDATE the existing row
      const previousScore = existing.score ?? null;
      const { error } = await supabase
        .from("student_scores")
        .update(updates)
        .eq("id", existing.id)
        .eq("school_id", school_id);
      if (error) {
        console.error("Score update error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Only record a change when the value actually changed.
      if (String(previousScore) !== String(score)) {
        await logScoreChange(supabase, {
          schoolId: school_id,
          actorId: userId,
          action: "score_update",
          studentId: student_id,
          termId: term_id,
          subjectId: subject_id ?? null,
          componentId,
          previousScore,
          newScore: Number(score),
          cycleId: lock.cycleId,
        });
      }
    } else {
      // INSERT a new row
      const { error } = await supabase
        .from("student_scores")
        .insert({ school_id, student_id, component_id: componentId, term_id, ...updates });
      if (error) {
        console.error("Score insert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logScoreChange(supabase, {
        schoolId: school_id,
        actorId: userId,
        action: "score_insert",
        studentId: student_id,
        termId: term_id,
        subjectId: subject_id ?? null,
        componentId,
        previousScore: null,
        newScore: Number(score),
        cycleId: lock.cycleId,
      });
    }
    return NextResponse.json({ success: true });


  } else if (type === "attendance") {
    const { student_id, term_id, days_school_opened, days_present, days_absent } = data;
    const denied = await ensureStudentAccess(student_id);
    if (denied) return denied;
    const { error } = await supabase.from("attendance_records").upsert({ school_id, student_id, term_id, days_school_opened, days_present, days_absent }, { onConflict: "student_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "psychomotor") {
    const { student_id, trait_id, term_id, score } = data;
    const denied = await ensureStudentAccess(student_id);
    if (denied) return denied;
    const { error } = await supabase.from("psychomotor_scores").upsert({ school_id, student_id, trait_id, term_id, score }, { onConflict: "student_id,trait_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "affective") {
    const { student_id, trait_id, term_id, score } = data;
    const denied = await ensureStudentAccess(student_id);
    if (denied) return denied;
    const { error } = await supabase.from("affective_scores").upsert({ school_id, student_id, trait_id, term_id, score }, { onConflict: "student_id,trait_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "comment") {
    const { student_id, term_id, comment } = data;
    const denied = await ensureStudentAccess(student_id);
    if (denied) return denied;
    const { error } = await supabase.from("teacher_comments").upsert({ school_id, student_id, term_id, comment }, { onConflict: "student_id,term_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
