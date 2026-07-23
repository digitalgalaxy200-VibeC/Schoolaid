import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { isTermApprovedForStudent } from "@/lib/report-card";

/**
 * Legacy endpoint — returns all published results for the current student.
 * Newer code uses /api/student/sessions and /api/student/report-card/[termId].
 */
export async function GET() {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  // Find student record
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (!student)
    return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Get published results from snapshot
  const { data: allResults } = await supabase
    .from("term_results")
    .select(
      "id, subject_id, total_score, grade, remark, term_id, subjects(name)",
    )
    .eq("student_id", student.id)
    .eq("published", true)
    .order("term_id");

  // Same class-approval gate as /api/student/sessions and /report-card/[termId]
  const candidateTermIds = [...new Set((allResults || []).map((r) => r.term_id))];
  const approvalChecks = await Promise.all(
    candidateTermIds.map((termId) => isTermApprovedForStudent(student.id, termId)),
  );
  const approvedTermIds = new Set(candidateTermIds.filter((_, i) => approvalChecks[i].approved));
  const results = (allResults || []).filter((r) => approvedTermIds.has(r.term_id));

  // Get active term
  const { data: activeTerm } = await supabase
    .from("academic_terms")
    .select("*")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();

  return NextResponse.json({ results: results || [], activeTerm });
}
