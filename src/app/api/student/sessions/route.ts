import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { isTermApprovedForStudent } from "@/lib/report-card";

/**
 * Returns sessions and terms that have published results for this student.
 * Also returns which terms are published vs not yet available.
 */
export async function GET() {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  // Find the student record from their profile
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", userId)
    .single();

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Get all sessions for this school
  const { data: sessions } = await supabase
    .from("academic_sessions")
    .select("id, name, is_active")
    .eq("school_id", school_id)
    .order("name", { ascending: false });

  // Get all terms for this school
  const { data: terms } = await supabase
    .from("academic_terms")
    .select("id, name, session_id, is_active")
    .eq("school_id", school_id)
    .order("name");

  // A term only "has results" once its class's report card has been
  // School-Admin-approved — not merely once one subject is published.
  const { data: publishedResults } = await supabase
    .from("term_results")
    .select("term_id")
    .eq("student_id", student.id)
    .eq("published", true);
  const candidateTermIds = [...new Set((publishedResults || []).map((r) => r.term_id))];
  const approvalChecks = await Promise.all(
    candidateTermIds.map((termId) => isTermApprovedForStudent(student.id, termId)),
  );
  const publishedTermIds = new Set(
    candidateTermIds.filter((_, i) => approvalChecks[i].approved),
  );

  // Build the response: sessions with their terms and published status
  const data = (sessions || []).map((session) => ({
    ...session,
    terms: (terms || [])
      .filter((t) => t.session_id === session.id)
      .map((t) => ({
        ...t,
        has_results: publishedTermIds.has(t.id),
      })),
  }));

  return NextResponse.json(data);
}
