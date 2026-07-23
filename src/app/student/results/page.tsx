"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

interface TermInfo { id: string; name: string; has_results: boolean; is_active: boolean }
interface SessionInfo { id: string; name: string; is_active: boolean; terms: TermInfo[] }

const selectClass = "w-full px-4 py-[10px] text-body bg-surface border border-border-strong rounded-sm disabled:opacity-50 disabled:cursor-not-allowed";

type Phase = "select" | "loading" | "ready";

export default function ResultsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [termId, setTermId] = useState("");
  const [phase, setPhase] = useState<Phase>("select");
  const [checkError, setCheckError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    fetch("/api/student/sessions")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load sessions");
        return r.json();
      })
      .then((data: SessionInfo[]) => {
        setSessions(data);
        const withResults = data.find((s) => s.terms.some((t) => t.has_results));
        if (withResults) setSessionId(withResults.id);
        setLoadingSessions(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingSessions(false);
      });
  }, []);

  const currentSession = sessions.find((s) => s.id === sessionId);
  const availableTerms = (currentSession?.terms || []).filter((t) => t.has_results);
  const hasAnyResults = sessions.some((s) => s.terms.some((t) => t.has_results));

  const handleSessionChange = (id: string) => {
    setSessionId(id);
    setTermId("");
  };

  const handleCheckResult = async () => {
    if (!termId) return;
    setPhase("loading");
    setCheckError("");
    try {
      const res = await fetch("/api/student/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId }),
      });
      const d = await res.json();
      if (!res.ok) { setCheckError(d.error || "Could not prepare your report card"); setPhase("select"); return; }
      setDownloadUrl(d.downloadUrl);
      setPhase("ready");
    } catch {
      setCheckError("Something went wrong. Please try again.");
      setPhase("select");
    }
  };

  const handleView = () => {
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const termName = availableTerms.find((t) => t.id === termId)?.name || "report-card";
      a.href = blobUrl;
      a.download = `${termName.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: let the browser handle the signed URL directly
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  const startOver = () => {
    setPhase("select");
    setDownloadUrl("");
  };

  if (loadingSessions) {
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
        <button onClick={() => window.location.reload()} className="text-small text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-h1 font-bold">Check Results</h1>
        <p className="text-small text-text-muted mt-1">Select a session and term to view your report card</p>
      </div>

      {!hasAnyResults ? (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-8 text-center">
            <div className="text-display mb-3 opacity-30">📚</div>
            <h3 className="text-h3 font-bold text-text-primary mb-2">No Results Yet</h3>
            <p className="text-body text-text-muted max-w-md mx-auto">
              Your results haven&apos;t been published yet. They will appear here once ready.
            </p>
          </div>
        </Card>
      ) : (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-5 space-y-5">
            {phase !== "loading" && (
              <>
                <div className="space-y-1">
                  <label className="text-small font-semibold text-text-secondary">Academic Session</label>
                  <select className={selectClass} value={sessionId} onChange={(e) => handleSessionChange(e.target.value)} disabled={phase === "ready"}>
                    {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-small font-semibold text-text-secondary">Academic Term</label>
                  <select className={selectClass} value={termId} onChange={(e) => setTermId(e.target.value)} disabled={phase === "ready" || availableTerms.length === 0}>
                    <option value="">{availableTerms.length === 0 ? "No results available for this session" : "Select a term"}</option>
                    {availableTerms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {checkError && (
                  <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
                    <p className="text-small text-error font-medium">{checkError}</p>
                  </div>
                )}

                {phase === "select" && (
                  <Button onClick={handleCheckResult} disabled={!termId} fullWidth>Check Result</Button>
                )}
              </>
            )}

            {phase === "loading" && (
              <div className="py-6 text-center space-y-3">
                <p className="text-body font-medium text-text-primary">Preparing your report card...</p>
                <div className="h-2.5 rounded-full bg-border overflow-hidden max-w-xs mx-auto">
                  <div className="h-full bg-success animate-pulse" style={{ width: "100%" }} />
                </div>
              </div>
            )}

            {phase === "ready" && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-col tablet:flex-row gap-3">
                  <Button onClick={handleView} fullWidth>View PDF</Button>
                  <Button onClick={handleDownload} variant="secondary" fullWidth>Download PDF</Button>
                </div>
                <button onClick={startOver} className="text-caption text-primary hover:underline block mx-auto">
                  Check a different term
                </button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
