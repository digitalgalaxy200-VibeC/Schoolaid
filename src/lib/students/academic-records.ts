import { getServiceClient } from "@/lib/supabase/service";

/**
 * A student's academic history, read from the stored result snapshots.
 *
 * This is the data the report-card workflow already writes (`term_results`) —
 * the same rows the student portal and published PDFs read. Nothing is
 * recomputed here, so an admin or teacher reviewing history sees exactly what
 * was recorded, and archiving a student does not remove any of it.
 *
 * Both the School Administration and Class Teacher menus call this through
 * their own authorised route; the route decides who may ask.
 */

type Db = ReturnType<typeof getServiceClient>;

export type AcademicSubjectResult = {
  subject_id: string | null;
  subject_name: string;
  subject_code: string | null;
  total_score: number;
  grade: string;
  remark: string | null;
};

export type AcademicTermRecord = {
  term_id: string;
  term_name: string;
  session_name: string;
  published: boolean;
  subjects: AcademicSubjectResult[];
};

export async function loadStudentAcademicRecords(
  db: Db,
  params: { school_id: string; student_id: string },
): Promise<AcademicTermRecord[]> {
  const { school_id, student_id } = params;

  const { data: results, error } = await db
    .from("term_results")
    .select("term_id, subject_id, subject_name, subject_code, total_score, grade, remark, published")
    .eq("student_id", student_id)
    .order("term_id");
  if (error) throw new Error(error.message);
  if (!results || results.length === 0) return [];

  const termIds = Array.from(new Set(results.map((row) => row.term_id as string)));

  const { data: terms, error: termError } = await db
    .from("academic_terms")
    .select("id, name, session_id, start_date")
    .eq("school_id", school_id)
    .in("id", termIds);
  if (termError) throw new Error(termError.message);

  const termById = new Map((terms || []).map((term) => [term.id as string, term]));

  const sessionIds = Array.from(
    new Set((terms || []).map((term) => term.session_id as string | null).filter(Boolean)),
  ) as string[];

  const { data: sessions } = sessionIds.length
    ? await db
        .from("academic_sessions")
        .select("id, name, start_date")
        .eq("school_id", school_id)
        .in("id", sessionIds)
    : { data: [] as { id: string; name: string; start_date: string | null }[] };

  const sessionById = new Map((sessions || []).map((session) => [session.id as string, session]));

  const grouped = new Map<string, AcademicTermRecord & { _termStart?: string; _sessionStart?: string }>();

  for (const row of results) {
    const termId = row.term_id as string;
    const term = termById.get(termId);
    const session = term?.session_id ? sessionById.get(term.session_id as string) : null;

    if (!grouped.has(termId)) {
      grouped.set(termId, {
        term_id: termId,
        term_name: (term?.name as string) || "Term",
        session_name: (session?.name as string) || "Session",
        published: false,
        subjects: [],
        _termStart: term?.start_date as string | undefined,
        _sessionStart: session?.start_date as string | undefined,
      });
    }

    const entry = grouped.get(termId)!;
    if (row.published) entry.published = true;
    entry.subjects.push({
      subject_id: (row.subject_id as string | null) ?? null,
      subject_name: (row.subject_name as string | null) || "Subject",
      subject_code: (row.subject_code as string | null) ?? null,
      total_score: Number(row.total_score) || 0,
      grade: (row.grade as string | null) || "—",
      remark: (row.remark as string | null) ?? null,
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const sessionCmp = String(b._sessionStart || "").localeCompare(String(a._sessionStart || ""));
      if (sessionCmp !== 0) return sessionCmp;
      return String(b._termStart || "").localeCompare(String(a._termStart || ""));
    })
    .map((record) => ({
      term_id: record.term_id,
      term_name: record.term_name,
      session_name: record.session_name,
      published: record.published,
      subjects: [...record.subjects].sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    }));
}
