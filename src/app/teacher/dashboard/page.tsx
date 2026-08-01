"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";

interface ClassInfo {
  id: string; name: string; grade: string; studentCount: number;
  subjects: { id: string; name: string }[]; role: string | null;
}

function ClassCard({ c }: { c: ClassInfo }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card variant="bordered" className="shadow-sm overflow-hidden">
      {/* Card Header - clickable to go to marks */}
      <div
        className="p-5 cursor-pointer hover:bg-surface-hover transition-colors"
        onClick={() => router.push(`/teacher/scores?class=${c.id}`)}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-h3 font-bold text-text-primary">{c.name}</h3>
          <div className="flex items-center gap-2">
            {c.role && (
              <Badge variant={c.role === "primary" ? "success" : "default"}>
                {c.role === "primary" ? "PRIMARY" : "ASST"}
              </Badge>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-6">
          <div>
            <p className="text-display font-extrabold text-primary">{c.studentCount}</p>
            <p className="text-caption text-text-muted">Students</p>
          </div>
          <div>
            <p className="text-display font-extrabold text-accent">{c.subjects.length}</p>
            <p className="text-caption text-text-muted">Subjects</p>
          </div>
        </div>
      </div>

      {/* Collapsible Subjects */}
      {c.subjects.length > 0 && (
        <div className="border-t border-border">
          {/* Toggle Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-surface-hover transition-colors"
          >
            <span className="text-caption font-semibold text-text-secondary">
              {expanded ? "Hide Subjects" : `View ${c.subjects.length} Subjects`}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-4 h-4 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Subject Pills */}
          {expanded && (
            <div className="px-5 pb-4 animate-fade-in">
              <div className="flex flex-wrap gap-1.5">
                {c.subjects.map((s) => (
                  <span
                    key={s.id}
                    className="inline-block text-caption font-semibold px-2.5 py-1 rounded-full border border-border bg-surface text-text-secondary"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="border-t border-border grid grid-cols-2">
        <button
          onClick={() => router.push(`/teacher/scores?class=${c.id}`)}
          className="flex items-center justify-center gap-1.5 py-3 text-caption font-semibold text-primary hover:bg-primary/5 transition-colors border-r border-border"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Enter Marks
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/teacher/report-card?class=${c.id}`); }}
          className="flex items-center justify-center gap-1.5 py-3 text-caption font-semibold text-accent hover:bg-accent/5 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Report Card
        </button>
      </div>
    </Card>
  );
}

export default function TeacherDashboard() {
  const [data, setData] = useState<{ school: any; classes: ClassInfo[]; activeTerm: any } | null>(null);
  const [user, setUser] = useState<{ full_name?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/teacher/dashboard").then((r) => r.json()),
    ]).then(([u, d]) => { setUser(u); setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" /></div>;
  if (!data) return <p className="text-text-muted text-center py-20">Unable to load dashboard.</p>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="bg-accent/5 p-5 flex items-center gap-4">
          {data.school?.logo_url && (
            <img src={data.school.logo_url} alt="" className="w-12 h-12 rounded-lg object-contain bg-white p-1 border border-border" />
          )}
          <div>
            <h1 className="text-h1 font-bold text-text-primary">{data.school?.name || "School"}</h1>
            <p className="text-small text-text-muted">Welcome, {user.full_name || "Teacher"} · Teacher</p>
          </div>
        </div>
      </Card>

      {/* Active Term */}
      {data.activeTerm && (
        <div className="bg-info-bg border border-info/20 rounded-sm px-4 py-2.5">
          <span className="text-small font-semibold text-info">{data.activeTerm.session_name} · {data.activeTerm.name}</span>
        </div>
      )}

      {/* Class Cards */}
      <h2 className="text-h2 font-bold">My Classes</h2>
      {data.classes.length === 0 ? (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">No classes assigned yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          {data.classes.map((c) => <ClassCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
