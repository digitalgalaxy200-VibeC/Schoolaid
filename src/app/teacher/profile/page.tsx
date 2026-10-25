"use client";

import { useEffect, useState } from "react";
import { ProfileDetailsForm, type ProfileDetails } from "@/components/profile/ProfileDetailsForm";

/**
 * A teacher had no profile page at all: the only way to correct her own details
 * was to ask the school admin. This is the page the login flow sends a new
 * teacher to, and it is where her profile completion is measured.
 */
export default function TeacherProfilePage() {
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load your profile.");
        return data;
      })
      .then((data) => {
        setDetails({
          full_name: data.profile_full_name ?? data.full_name ?? "",
          phone: data.phone ?? "",
          contact_email: data.contact_email ?? "",
          gender: data.gender ?? "",
          percent: data.profile_percent ?? 0,
          complete: data.profile_complete === true,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your profile."));
  }, []);

  if (error) {
    return (
      <div className="max-w-xl">
        <div className="rounded-sm border border-error bg-error-bg px-4 py-3">
          <p className="text-small font-medium text-error">{error}</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-h1 font-bold">My Profile</h1>
        <p className="mt-1 text-small text-text-muted">
          Keep these details current — they are how your school reaches you.
        </p>
      </div>

      <ProfileDetailsForm role="teacher" initial={details} redirectWhenComplete />
    </div>
  );
}
