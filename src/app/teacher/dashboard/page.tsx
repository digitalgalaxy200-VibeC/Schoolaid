"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

interface ClassInfo {
  id: string;
  name: string;
  grade: string;
  studentCount: number;
  subjects: { id: string; name: string }[];
  role: string | null;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [data, setData] = useState<{
    school: any;
    classes: ClassInfo[];
    activeTerm: any;
  } | null>(null);
  const [user, setUser] = useState<{ full_name?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/teacher/dashboard").then((r) => r.json()),
    ])
      .then(([u, d]) => {
        setUser(u);
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  if (!data)
    return (
      <p className="text-text-muted text-center py-20">
        Unable to load dashboard.
      </p>
    );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="bg-accent/5 p-5 flex items-center gap-4">
          {data.school?.logo_url && (
            <img
              src={data.school.logo_url}
              alt=""
              className="w-12 h-12 rounded-lg object-contain bg-white p-1 border border-border"
            />
          )}
          <div>
            <h1 className="text-h1 font-bold text-text-primary">
              {data.school?.name || "School"}
            </h1>
            <p className="text-small text-text-muted">
              Welcome, {user.full_name || "Teacher"} · Teacher
            </p>
          </div>
        </div>
      </Card>

      {/* Active Term Banner */}
      {data.activeTerm && (
        <div className="bg-info-bg border border-info/20 rounded-sm px-4 py-2.5">
          <span className="text-small font-semibold text-info">
            {data.activeTerm.session_name} · {data.activeTerm.name}
          </span>
        </div>
      )}

      {/* Class Cards */}
      <h2 className="text-h2 font-bold">My Classes</h2>
      {data.classes.length === 0 ? (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">
            No classes assigned yet.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          {data.classes.map((c) => (
            <Card
              key={c.id}
              variant="bordered"
              className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/teacher/scores?class=${c.id}`)}
            >
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-h3 font-bold">{c.name}</h3>
                  {c.role && (
                    <Badge
                      variant={c.role === "primary" ? "success" : "default"}
                    >
                      {c.role === "primary" ? "Primary" : "Assistant"}
                    </Badge>
                  )}
                </div>
                {c.grade && (
                  <p className="text-caption text-text-muted mb-3">{c.grade}</p>
                )}
                <div className="flex gap-6">
                  <div>
                    <p className="text-display font-extrabold text-primary">
                      {c.studentCount}
                    </p>
                    <p className="text-caption text-text-muted">Students</p>
                  </div>
                  <div>
                    <p className="text-display font-extrabold text-accent">
                      {c.subjects.length}
                    </p>
                    <p className="text-caption text-text-muted">My Subjects</p>
                  </div>
                </div>
                {c.subjects.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-caption text-text-muted mb-1">
                      Subjects:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {c.subjects.map((s) => (
                        <Badge key={s.id} variant="default">
                          {s.name}
                        </Badge>
                      ))}
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
