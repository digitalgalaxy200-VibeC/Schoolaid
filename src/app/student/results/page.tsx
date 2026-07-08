"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";

interface TermInfo {
  id: string;
  name: string;
  has_results: boolean;
  is_active: boolean;
}

interface SessionInfo {
  id: string;
  name: string;
  is_active: boolean;
  terms: TermInfo[];
}

export default function ResultsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/student/sessions")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load sessions");
        return r.json();
      })
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-small text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const hasAnyResults = sessions.some((s) =>
    s.terms.some((t) => t.has_results)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-h1 font-bold">My Results</h1>
        <p className="text-small text-text-muted mt-1">
          Select a session and term to view your published results
        </p>
      </div>

      {!hasAnyResults && (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-8 text-center">
            <div className="text-display mb-3 opacity-30">&#128218;</div>
            <h3 className="text-h3 font-bold text-text-primary mb-2">
              No Results Yet
            </h3>
            <p className="text-body text-text-muted max-w-md mx-auto">
              Your results haven&apos;t been published for any term yet. They
              will appear here once your teachers publish them.
            </p>
          </div>
        </Card>
      )}

      {sessions.map((session) => {
        const publishedTerms = session.terms.filter((t) => t.has_results);
        const unpublishedTerms = session.terms.filter((t) => !t.has_results);

        return (
          <Card key={session.id} variant="bordered" className="shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-h2 font-bold">{session.name}</h2>
                {session.is_active && (
                  <Badge variant="info">Active</Badge>
                )}
              </div>

              {publishedTerms.length > 0 && (
                <div className="mb-4">
                  <p className="text-caption font-semibold text-text-muted uppercase mb-2">
                    Available Results
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {publishedTerms.map((term) => (
                      <button
                        key={term.id}
                        onClick={() =>
                          router.push(
                            `/student/results/${session.id}/${term.id}`
                          )
                        }
                        className="flex items-center justify-between p-4 bg-success-bg border border-success/20 rounded-sm hover:border-success transition-colors text-left"
                      >
                        <div>
                          <p className="font-semibold text-text-primary">
                            {term.name}
                          </p>
                          <p className="text-caption text-success font-medium">
                            Results available
                          </p>
                        </div>
                        <span className="text-success text-h3">&rarr;</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unpublishedTerms.length > 0 && (
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase mb-2">
                    Not Yet Available
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {unpublishedTerms.map((term) => (
                      <div
                        key={term.id}
                        className="p-4 bg-bg border border-border rounded-sm opacity-60"
                      >
                        <p className="font-semibold text-text-muted">
                          {term.name}
                        </p>
                        <p className="text-caption text-text-muted">
                          Not yet available
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {session.terms.length === 0 && (
                <p className="text-small text-text-muted py-2">
                  No terms configured for this session.
                </p>
              )}
            </div>
          </Card>
        );
      })}

      {sessions.length === 0 && (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-6 text-center">
            <p className="text-text-muted">
              No academic sessions have been configured yet.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
