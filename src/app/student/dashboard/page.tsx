"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";

type TermResult = {
  term_id: string;
  term_name: string;
  session_name: string;
  subjects: {
    subject_name: string;
    total_score: number;
    grade: string;
    remark: string;
  }[];
};

export default function StudentDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<
    { id: string; session_name: string }[]
  >([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [terms, setTerms] = useState<{ id: string; term_name: string }[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [results, setResults] = useState<TermResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [schoolId, setSchoolId] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      const sid = user.app_metadata?.student_id as string;
      const scid = user.app_metadata?.school_id as string;
      setStudentId(sid);
      setSchoolId(scid);

      const { data: sessionData } = await supabase
        .from("academic_sessions")
        .select("id, session_name")
        .eq("school_id", scid)
        .order("created_at", { ascending: false });

      if (sessionData) setSessions(sessionData);
      setLoading(false);
    };
    load();
  }, []);

  const handleSessionChange = async (sessionId: string) => {
    setSelectedSession(sessionId);
    setSelectedTerm("");
    setResults(null);
    const supabase = createClient();
    const { data } = await supabase
      .from("terms")
      .select("id, term_name")
      .eq("school_id", schoolId)
      .eq("session_id", sessionId)
      .order("term_name");
    setTerms(data ?? []);
  };

  const handleTermChange = async (termId: string) => {
    setSelectedTerm(termId);
    setLoadingResults(true);
    const supabase = createClient();

    // Check if published
    const { data: published } = await supabase
      .from("published_results")
      .select("published")
      .eq("student_id", studentId)
      .eq("term_id", termId)
      .eq("school_id", schoolId)
      .single();

    if (!published?.published) {
      setResults(null);
      setLoadingResults(false);
      return;
    }

    // Fetch frozen snapshot
    const { data: snapshot } = await supabase
      .from("term_results")
      .select(`total_score, grade, remark, subjects(subject_name)`)
      .eq("student_id", studentId)
      .eq("term_id", termId)
      .eq("school_id", schoolId);

    const termMeta = terms.find((t) => t.id === termId);
    const sessionMeta = sessions.find((s) => s.id === selectedSession);

    setResults({
      term_id: termId,
      term_name: termMeta?.term_name ?? "",
      session_name: sessionMeta?.session_name ?? "",
      subjects: (snapshot ?? []).map((r: any) => ({
        subject_name: r.subjects?.subject_name ?? "Subject",
        total_score: r.total_score,
        grade: r.grade,
        remark: r.remark,
      })),
    });
    setLoadingResults(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">My Results</h1>
        <p className="text-small text-text-muted mt-1">
          Select a session and term to view your report card
        </p>
      </div>

      {/* Session & Term selectors */}
      <Card variant="bordered" className="shadow-sm space-y-4">
        <div>
          <label className="block text-small font-semibold text-text-secondary mb-1">
            Academic Session
          </label>
          <select
            value={selectedSession}
            onChange={(e) => handleSessionChange(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2 text-body bg-bg focus:outline-none focus:border-primary"
          >
            <option value="">— Select Session —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.session_name}
              </option>
            ))}
          </select>
        </div>

        {selectedSession && (
          <div>
            <label className="block text-small font-semibold text-text-secondary mb-1">
              Term
            </label>
            <select
              value={selectedTerm}
              onChange={(e) => handleTermChange(e.target.value)}
              className="w-full border border-border rounded-sm px-3 py-2 text-body bg-bg focus:outline-none focus:border-primary"
            >
              <option value="">— Select Term —</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* Results */}
      {loadingResults && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
        </div>
      )}

      {!loadingResults && selectedTerm && !results && (
        <Card variant="bordered" className="text-center py-10">
          <p className="text-text-muted">
            Results for this term have not been published yet.
          </p>
          <p className="text-caption text-text-muted mt-1">
            Check back after your teacher publishes them.
          </p>
        </Card>
      )}

      {results && results.subjects.length > 0 && (
        <Card variant="bordered" className="shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-h3 font-bold">
                {results.term_name} — {results.session_name}
              </h2>
              <p className="text-caption text-text-muted mt-0.5">
                Published result — official snapshot
              </p>
            </div>
            <button
              onClick={() =>
                router.push(`/student/results?term=${results.term_id}`)
              }
              className="px-4 py-2 bg-primary text-white rounded-sm text-small font-semibold hover:bg-primary-dark transition-colors"
            >
              Download PDF
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-text-secondary">
                    Subject
                  </th>
                  <th className="text-center py-2 px-4 font-semibold text-text-secondary">
                    Total
                  </th>
                  <th className="text-center py-2 px-4 font-semibold text-text-secondary">
                    Grade
                  </th>
                  <th className="text-left py-2 pl-4 font-semibold text-text-secondary">
                    Remark
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.subjects.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-medium">{s.subject_name}</td>
                    <td className="py-3 px-4 text-center font-bold text-primary">
                      {s.total_score}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          s.grade === "A"
                            ? "success"
                            : s.grade === "F"
                              ? "error"
                              : "default"
                        }
                      >
                        {s.grade}
                      </Badge>
                    </td>
                    <td className="py-3 pl-4 text-text-secondary">
                      {s.remark}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
