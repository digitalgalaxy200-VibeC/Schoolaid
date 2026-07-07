"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";

type Stats = {
  total_schools: number;
  active_subscriptions: number;
  suspended_schools: number;
  recent_schools: {
    id: string;
    name: string;
    subscription_status: string;
    created_at: string;
  }[];
};

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-admin/schools?archived=false")
      .then((r) => r.json())
      .then((schools: any[]) => {
        if (Array.isArray(schools)) {
          setStats({
            total_schools: schools.length,
            active_subscriptions: schools.filter(
              (s) => s.subscription_status === "active",
            ).length,
            suspended_schools: schools.filter(
              (s) => s.subscription_status === "suspended",
            ).length,
            recent_schools: schools.slice(0, 5),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase font-mono">
            Total Schools
          </p>
          <p className="text-display font-extrabold text-primary">
            {stats?.total_schools ?? 0}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase font-mono">
            Active
          </p>
          <p className="text-display font-extrabold text-success">
            {stats?.active_subscriptions ?? 0}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase font-mono">
            Suspended
          </p>
          <p className="text-display font-extrabold text-error">
            {stats?.suspended_schools ?? 0}
          </p>
        </Card>
      </div>

      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Recent Schools</h2>
        {stats?.recent_schools.map((s) => (
          <div
            key={s.id}
            onClick={() => router.push(`/super-admin/schools/${s.id}`)}
            className="flex items-center justify-between py-2 px-3 rounded-sm cursor-pointer hover:bg-bg"
          >
            <div>
              <p className="text-body font-semibold">{s.name}</p>
              <p className="text-caption text-text-muted">
                {new Date(s.created_at).toLocaleDateString()}
              </p>
            </div>
            <Badge
              variant={
                s.subscription_status === "active"
                  ? "success"
                  : s.subscription_status === "suspended"
                    ? "error"
                    : "default"
              }
            >
              {s.subscription_status}
            </Badge>
          </div>
        ))}
        {(!stats?.recent_schools || stats.recent_schools.length === 0) && (
          <p className="text-small text-text-muted text-center py-4">
            No schools yet.
          </p>
        )}
      </Card>
    </div>
  );
}
