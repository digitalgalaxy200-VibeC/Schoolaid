"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

interface SchoolInfo {
  name?: string;
  logo_url?: string | null;
  motto?: string;
}

interface ProfileInfo {
  full_name?: string;
  class_name?: string;
  photo_url?: string | null;
}

export default function StudentDashboard() {
  const router = useRouter();
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/student/school-info").then((r) => r.json()),
      fetch("/api/student/profile").then((r) => r.json()),
    ])
      .then(([schoolData, profileData]) => {
        setSchool(schoolData);
        setProfile(profileData);
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
      {/* Header */}
      <Card variant="bordered" className="shadow-md overflow-hidden">
        <div className="bg-role-student/5 p-6 flex items-center gap-4">
          {profile?.photo_url ? (
            <img
              src={profile.photo_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white border border-border flex items-center justify-center text-h2 text-text-muted shrink-0">
              {profile?.full_name?.charAt(0) || "?"}
            </div>
          )}
          <div className="min-w-0">
            {school?.logo_url && (
              <img src={school.logo_url} alt="" className="h-6 mb-1 object-contain" />
            )}
            {school?.name && (
              <p className="text-small text-text-secondary truncate">{school.name}</p>
            )}
            <h1 className="text-h1 font-bold text-text-primary truncate">
              Welcome, {profile?.full_name?.split(" ")[0] || "Student"}
            </h1>
            {profile?.class_name && (
              <p className="text-small text-text-muted mt-0.5">Class: {profile.class_name}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
        <button
          onClick={() => router.push("/student/results")}
          className="text-left p-8 bg-surface border border-border rounded-sm hover:border-primary transition-colors"
        >
          <div className="text-display mb-2">📄</div>
          <h2 className="text-h3 font-bold text-text-primary">Check Results</h2>
          <p className="text-small text-text-muted mt-1">View and download your report card</p>
        </button>
        <button
          onClick={() => router.push("/student/profile")}
          className="text-left p-8 bg-surface border border-border rounded-sm hover:border-primary transition-colors"
        >
          <div className="text-display mb-2">👤</div>
          <h2 className="text-h3 font-bold text-text-primary">My Profile</h2>
          <p className="text-small text-text-muted mt-1">Update your photo and personal information</p>
        </button>
      </div>
    </div>
  );
}
