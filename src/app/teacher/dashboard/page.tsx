"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";

interface ClassInfo {
  id: string; name: string; grade: string; studentCount: number;
  subjects: { id: string; name: string }[]; role: string | null;
}

export default function TeacherDashboard() {
  const router = useRouter();
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
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header card */}
      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="bg-accent/5 p-4 flex items-center gap-3">
          {data.school?.logo_url && (
            <img src={data.school.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white p-1 border border-border shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold text-text-primary truncate">{data.school?.name || "School"}</h1>
            <p className="text-xs text-text-muted mt-0.5">Welcome, {user.full_name || "Teacher"} · Teacher</p>
          </div>
        </div>
      </Card>

      {/* Active Term */}
      {data.activeTerm && (
        <div className="bg-info-bg border border-info/20 rounded-md px-3 py-2">
          <span className="text-xs font-semibold text-info">{data.activeTerm.session_name} · {data.activeTerm.name}</span>
        </div>
      )}

      {/* Class cards */}
      <h2 className="text-base font-bold">My Classes</h2>
      {data.classes.length === 0 ? (
        <Card variant="bordered"><p className="text-sm text-text-muted py-8 text-center">No classes assigned yet.</p></Card>
      ) : (
        <div className="space-y-3 tablet:grid tablet:grid-cols-2 tablet:gap-3 tablet:space-y-0">
          {data.classes.map((c) => (
            <Card key={c.id} variant="bordered" className="shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
              onClick={() => router.push(`/teacher/scores?class=${c.id}`)}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold">{c.name}</h3>
                  {c.role && <Badge variant={c.role === "primary" ? "success" : "default"}>{c.role === "primary" ? "Primary" : "Asst"}</Badge>}
                </div>
                {c.grade && <p className="text-xs text-text-muted mb-2">{c.grade}</p>}
                <div className="flex gap-5">
                  <div>
                    <p className="text-lg font-extrabold text-primary">{c.studentCount}</p>
                    <p className="text-xs text-text-muted">Students</p>
                  </div>
                  <div>
                    <p className="text-lg font-extrabold text-accent">{c.subjects.length}</p>
                    <p className="text-xs text-text-muted">Subjects</p>
                  </div>
                </div>
                {c.subjects.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="flex flex-wrap gap-1">
                      {c.subjects.map((s) => <Badge key={s.id} variant="default">{s.name}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
