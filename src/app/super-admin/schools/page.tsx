"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Badge } from "@/components/ui";

type School = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  subscription_status: string;
  created_at: string;
};

export default function SchoolsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    const { data } = await supabase
      .from("schools")
      .select("id, name, slug, email, phone, subscription_status, created_at")
      .order("created_at", { ascending: false });

    if (data) setSchools(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-bold">Schools</h1>
          <p className="text-small text-text-muted mt-1">
            Manage all schools on the platform
          </p>
        </div>
        <Button onClick={() => router.push("/super-admin/schools/new")}>
          Create School
        </Button>
      </div>

      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  School
                </th>
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Email
                </th>
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Created
                </th>
                <th className="text-right px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr
                  key={school.id}
                  className="border-b border-border last:border-b-0 hover:bg-bg transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/super-admin/schools/${school.id}`)
                  }
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold">{school.name}</p>
                    <p className="text-caption text-text-muted">
                      /{school.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {school.email}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(school.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/super-admin/schools/${school.id}`);
                      }}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}

              {schools.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No schools yet. Create the first school to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
