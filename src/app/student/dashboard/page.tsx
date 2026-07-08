"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui";

interface SchoolInfo {
  name?: string;
  logo_url?: string | null;
  motto?: string;
}

export default function StudentDashboard() {
  const router = useRouter();
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

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          variant="bordered"
          className="shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full bg-role-student/10 flex items-center justify-center text-role-student text-h3 font-bold">
                &#9998;
              </span>
              <div>
                <h3 className="text-h3 font-bold">Check Results</h3>
                <p className="text-caption text-text-muted mt-0.5">
                  View your published report cards
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push("/student/results")}
              className="w-full"
            >
              View My Results
            </Button>
          </div>
        </Card>

        <Card
          variant="bordered"
          className="shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full bg-info-bg flex items-center justify-center text-info text-h3 font-bold">
                &#128196;
              </span>
              <div>
                <h3 className="text-h3 font-bold">Download PDF</h3>
                <p className="text-caption text-text-muted mt-0.5">
                  Download your official report card
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/student/results")}
              className="w-full"
            >
              Go to Results
            </Button>
          </div>
        </Card>
      </div>

      {/* Info Card */}
      <Card variant="bordered" className="shadow-sm">
        <div className="p-5">
          <h3 className="text-h3 font-bold mb-3">About Your Results</h3>
          <div className="space-y-2 text-small text-text-secondary">
            <p>
              Your results are published by your teachers and approved by your
              school administration. Only published results are visible here.
            </p>
            <p>
              If you have questions about your grades, please contact your class
              teacher or school administrator directly.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
