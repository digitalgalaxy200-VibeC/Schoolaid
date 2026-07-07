"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";

type DashboardStats = {
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
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const { data: allSchools } = await supabase
      .from("schools")
      .select("id, name, subscription_status, created_at")
      .order("created_at", { ascending: false });

    if (allSchools) {
      setStats({
        total_schools: allSchools.length,
        active_subscriptions: allSchools.filter(
          (s) => s.subscription_status === "active",
        ).length,
        suspended_schools: allSchools.filter(
          (s) => s.subscription_status === "suspended",
        ).length,
        recent_schools: allSchools.slice(0, 5),
      });
    }
    setLoading(false);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">Dashboard</h1>
        <p className="text-small text-text-muted mt-1">
          Platform overview and key metrics
        </p>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
            Total Schools
          </p>
          <p className="text-display font-extrabold text-primary mt-1">
            {stats?.total_schools ?? 0}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
            Active
          </p>
          <p className="text-display font-extrabold text-success mt-1">
            {stats?.active_subscriptions ?? 0}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm">
          <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
            Suspended
          </p>
          <p className="text-display font-extrabold text-error mt-1">
            {stats?.suspended_schools ?? 0}
          </p>
        </Card>
      </div>

      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Recent Schools</h2>
        <div className="space-y-1">
          {stats?.recent_schools.map((school) => (
            <div
              key={school.id}
              onClick={() => router.push(`/super-admin/schools/${school.id}`)}
              className="flex items-center justify-between py-2 px-3 rounded-sm cursor-pointer hover:bg-bg transition-colors"
            >
              <div>
                <p className="text-body font-semibold text-text-primary">
                  {school.name}
                </p>
                <p className="text-caption text-text-muted">
                  {new Date(school.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge
                variant={
                  school.subscription_status === "active"
                    ? "success"
                    : school.subscription_status === "suspended"
                      ? "error"
                      : "default"
                }
              >
                {school.subscription_status}
              </Badge>
            </div>
          ))}
          {(!stats?.recent_schools || stats.recent_schools.length === 0) && (
            <p className="text-small text-text-muted text-center py-4">
              No schools yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
