import { getServiceClient } from "@/lib/supabase/service";

/**
 * A student's FINAL academic records, term by term.
 *
 * This reads only `term_results` — the frozen snapshot written when a class
 * report card is approved. Live scores for an unapproved term are deliberately
 * not included: "View Academic Records" is the issued record, and the report
 * card PDF is generated from it.
 *
 * SUBJECT NAMES: older `term_results` rows carry `subject_id` but a NULL
 * `subject_name` (the approve flow did not snapshot it historically). Names are
 * resolved from `subjects` whenever the snapshot is missing, so the list is
 * never a column of repeated "Subject" placeholders.
 *
 * Both the School Administration and Class Teacher routes call this through
 * their own authorised endpoint; the route decides who may ask.
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

type TermRow = {
  id: string;
  name: string | null;
  session_id: string | null;
  start_date: string | null;
};

type SessionRow = { id: string; name: string | null; start_date: string | null };
type SubjectRow = { id: string; name: string | null; code: string | null };

type RawResult = {
  term_id: string;
  subject_id: string | null;
  subject_name: string | null;
  subject_code: string | null;
  total_score: number | string | null;
  grade: string | null;
  remark: string | null;
  published: boolean | null;
};

export async function loadStudentAcademicRecords(
  db: Db,
  params: { school_id: string; student_id: string },
): Promise<AcademicTermRecord[]> {
  const { school_id, student_id } = params;

  // ── Stored final results (all terms) ──────────────────────────────────────
  const { data: resultData, error: resultError } = await db
    .from("term_results")
    .select(
      "term_id, subject_id, subject_name, subject_code, total_score, grade, remark, published",
    )
    .eq("school_id", school_id)
    .eq("student_id", student_id);
  if (resultError) throw new Error(resultError.message);

  const results = (resultData || []) as RawResult[];
  if (results.length === 0) return [];

  // ── Names: term/session metadata ──────────────────────────────────────────
  const termIds = Array.from(new Set(results.map((row) => row.term_id)));

  const { data: termData } = await db
    .from("academic_terms")
    .select("id, name, session_id, start_date")
    .eq("school_id", school_id)
    .in("id", termIds);
  const terms = (termData || []) as TermRow[];
  const termById = new Map(terms.map((term) => [term.id, term]));

  const sessionIds = Array.from(
    new Set(terms.map((term) => term.session_id).filter((id): id is string => !!id)),
  );
  const { data: sessionData } = sessionIds.length
    ? await db
        .from("academic_sessions")
        .select("id, name, start_date")
        .eq("school_id", school_id)
        .in("id", sessionIds)
    : { data: [] as SessionRow[] };
  const sessionById = new Map(
    ((sessionData || []) as SessionRow[]).map((session) => [session.id, session]),
  );

  // ── Names: the subject catalog ────────────────────────────────────────────
  const subjectIds = Array.from(
    new Set(results.map((row) => row.subject_id).filter((id): id is string => !!id)),
  );
  const { data: subjectData } = subjectIds.length
    ? await db.from("subjects").select("id, name, code").eq("school_id", school_id).in("id", subjectIds)
    : { data: [] as SubjectRow[] };
  const subjectById = new Map(
    ((subjectData || []) as SubjectRow[]).map((subject) => [subject.id, subject]),
  );

  // ── Group ─────────────────────────────────────────────────────────────────
  const grouped = new Map<
    string,
    AcademicTermRecord & { _termStart?: string; _sessionStart?: string }
  >();

  for (const row of results) {
    const term = termById.get(row.term_id);
    const session = term?.session_id ? sessionById.get(term.session_id) : null;
    const subject = row.subject_id ? subjectById.get(row.subject_id) : null;

    if (!grouped.has(row.term_id)) {
      grouped.set(row.term_id, {
        term_id: row.term_id,
        term_name: (term?.name as string) || "Term",
        session_name: (session?.name as string) || "Session",
        // A card is published only when every subject row is published; a
        // partially published term is still a draft.
        published: true,
        subjects: [],
        _termStart: term?.start_date ?? undefined,
        _sessionStart: session?.start_date ?? undefined,
      });
    }

    const entry = grouped.get(row.term_id)!;
    entry.published = entry.published && row.published === true;
    entry.subjects.push({
      subject_id: row.subject_id,
      subject_name: row.subject_name || subject?.name || "Subject",
      subject_code: row.subject_code || subject?.code || null,
      total_score: Number(row.total_score) || 0,
      grade: row.grade || "—",
      remark: row.remark ?? null,
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
      subjects: [...record.subjects].sort((a, b) =>
        a.subject_name.localeCompare(b.subject_name),
      ),
    }));
}
