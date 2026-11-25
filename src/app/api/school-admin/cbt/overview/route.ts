import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { readCbtEntitlement } from "@/lib/cbt/entitlement";

/**
 * GET /api/school-admin/cbt/overview
 *
 * A READ-ONLY picture of CBT for the school administrator: how many assessments
 * exist, what state they are in, and how many attempts students have made.
 *
 * Authoring stays in the teacher portal. Duplicating a second assessment builder
 * here would create two sources of truth for the same exam, so this screen
 * deliberately has no create/edit controls.
 */
export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const entitlement = await readCbtEntitlement(supabase, school_id);

  if (!entitlement.enabled) {
    return NextResponse.json({
      enabled: false,
      error: entitlement.error,
      term: null,
      counts: {
        assessments: 0,
        published: 0,
        inProgress: 0,
        questions: 0,
        attempts: 0,
        submitted: 0,
        marked: 0,
      },
      assessments: [],
    });
  }

  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, name")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();

  let assessmentQuery = supabase
    .from("cbt_assessments")
    .select(
      "id, title, status, class_id, subject_id, term_id, published_at, created_at, classes(name), subjects(name)",
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (term?.id) assessmentQuery = assessmentQuery.eq("term_id", term.id);

  const [assessmentsRes, questionsRes, linkedQuestionsRes] = await Promise.all([
    assessmentQuery,
    supabase
      .from("cbt_questions")
      .select("id", { count: "exact", head: true })
      .eq("school_id", school_id),
    supabase
      .from("cbt_assessment_questions")
      .select("id", { count: "exact", head: true })
      .eq("school_id", school_id),
  ]);

  if (assessmentsRes.error) {
    return NextResponse.json({ error: assessmentsRes.error.message }, { status: 500 });
  }

  const assessmentRows = (assessmentsRes.data || []) as {
    id: string;
    title: string;
    status: string;
    class_id: string;
    subject_id: string | null;
    term_id: string | null;
    published_at: string | null;
    created_at: string;
    classes: { name: string } | { name: string }[] | null;
    subjects: { name: string } | { name: string }[] | null;
  }[];

  const assessmentIds = assessmentRows.map((row) => row.id);
  let attempts: { assessment_id: string; status: string }[] = [];

  if (assessmentIds.length > 0) {
    const { data } = await supabase
      .from("cbt_attempts")
      .select("assessment_id, status")
      .eq("school_id", school_id)
      .in("assessment_id", assessmentIds);
    attempts = (data || []) as { assessment_id: string; status: string }[];
  }

  const attemptsByAssessment = new Map<
    string,
    { attempts: number; submitted: number; marked: number; in_progress: number }
  >();
  const totals = { attempts: 0, submitted: 0, marked: 0, in_progress: 0 };

  for (const attempt of attempts) {
    const entry = attemptsByAssessment.get(attempt.assessment_id) ?? {
      attempts: 0,
      submitted: 0,
      marked: 0,
      in_progress: 0,
    };
    entry.attempts += 1;
    totals.attempts += 1;

    if (attempt.status === "submitted") {
      entry.submitted += 1;
      totals.submitted += 1;
    } else if (attempt.status === "marked") {
      entry.marked += 1;
      totals.marked += 1;
    } else if (attempt.status === "in_progress") {
      entry.in_progress += 1;
      totals.in_progress += 1;
    }

    attemptsByAssessment.set(attempt.assessment_id, entry);
  }

  const assessments = assessmentRows.map((row) => {
    const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    const attemptCounts = attemptsByAssessment.get(row.id) ?? {
      attempts: 0,
      submitted: 0,
      marked: 0,
      in_progress: 0,
    };

    return {
      id: row.id,
      title: row.title,
      status: row.status,
      className: cls?.name || "Unknown class",
      subjectName: subject?.name || null,
      publishedAt: row.published_at,
      attempts: attemptCounts.attempts,
      completed: attemptCounts.submitted + attemptCounts.marked,
      inProgress: attemptCounts.in_progress,
    };
  });

  return NextResponse.json({
    enabled: true,
    error: null,
    term: term ? { id: term.id, name: term.name } : null,
    counts: {
      assessments: assessments.length,
      published: assessments.filter((row) => row.status === "published").length,
      inProgress: assessments.filter((row) => row.status === "draft" || row.status === "review").length,
      questions: questionsRes.count ?? 0,
      linkedQuestions: linkedQuestionsRes.count ?? 0,
      attempts: totals.attempts,
      submitted: totals.submitted,
      marked: totals.marked,
      openAttempts: totals.in_progress,
    },
    assessments,
  });
}
