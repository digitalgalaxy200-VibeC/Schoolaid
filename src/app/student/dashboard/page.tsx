"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";

interface SchoolInfo {
  name?: string;
  logo_url?: string | null;
  motto?: string;
}

export default function StudentDashboard() {
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [user, setUser] = useState<{
    full_name?: string;
    email?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/student/school-info").then((r) => r.json()),
    ])
      .then(([userData, schoolData]) => {
        setUser(userData);
        setSchool(schoolData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Card */}
      <Card variant="bordered" className="shadow-md overflow-hidden">
        <div className="bg-role-student/5 p-6">
          <div className="flex items-start gap-4">
            {school?.logo_url && (
              <img
                src={school.logo_url}
                alt={school.name}
                className="w-16 h-16 rounded-lg object-contain bg-white p-1 border border-border"
              />
            )}
            <div>
              <Badge variant="success" className="mb-2">
                Student Portal
              </Badge>
              <h1 className="text-h1 font-bold text-text-primary">
                Welcome
                {user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
              </h1>
              {school?.name && (
                <p className="text-body text-text-secondary mt-1">
                  {school.name}
                </p>
              )}
              {school?.motto && (
                <p className="text-small text-text-muted italic mt-0.5">
                  &ldquo;{school.motto}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Coming Soon */}
      <Card variant="bordered" className="shadow-sm">
        <div className="p-12 text-center">
          <div className="text-display mb-4 opacity-25">&#128640;</div>
          <h2 className="text-h2 font-bold text-text-primary mb-2">
            Coming Soon
          </h2>
          <p className="text-body text-text-muted max-w-md mx-auto">
            Your student dashboard is being built. You&apos;ll be able to view
            your results, download report cards, and more — all from right here.
          </p>
        </div>
      </Card>
    </div>
  );
}
