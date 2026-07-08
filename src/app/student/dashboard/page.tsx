"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";

export default function StudentDashboard() {
  const [data, setData] = useState<any>({ results: [], activeTerm: null });
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setEmail(d.email || ""));
    fetch("/api/student/results")
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">My Results</h1>
      {data.activeTerm && <Badge variant="info">{data.activeTerm.name}</Badge>}
      <div className="grid gap-4">
        {data.results.map((r: any) => (
          <Card key={r.id} variant="bordered" className="shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-h3 font-bold">{r.subjects?.name}</h3>
                <p className="text-caption text-text-muted">{r.term?.name}</p>
              </div>
              <div className="text-right">
                <p className="text-display font-extrabold text-primary">
                  {r.total_score}
                </p>
                <Badge variant="success">{r.grade}</Badge>
                {r.remark && (
                  <p className="text-caption text-text-muted mt-1">
                    {r.remark}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
        {data.results.length === 0 && (
          <p className="text-text-muted text-center py-8">
            No published results yet.
          </p>
        )}
      </div>
    </div>
  );
}
