"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CopilotLauncher } from "./CopilotLauncher";
import { CopilotPanel } from "./CopilotPanel";

export function GlobalCopilot() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ role?: string; impersonated?: boolean; school_id?: string; school_name?: string } | null>(null);
  
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [urlSchoolId, setUrlSchoolId] = useState<string | null>(null);
  const [urlSchoolName, setUrlSchoolName] = useState<string>("");

  // Re-fetch user to check if they started or ended impersonation
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  }, [pathname]);

  // Detect school context from URL (when super admin is browsing a school page without impersonating)
  useEffect(() => {
    const match = pathname.match(/\/super-admin\/schools\/([^/]+)/);
    if (match) {
      const slug = match[1];
      if (slug && slug !== "new") {
        fetch(`/api/super-admin/schools/${slug}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.id) {
              setUrlSchoolId(data.id);
              setUrlSchoolName(data.name || slug);
            }
          })
          .catch(() => {});
      }
    } else {
      setUrlSchoolId(null);
      setUrlSchoolName("");
    }
  }, [pathname]);

  // Determine if copilot should be shown
  const showCopilot = user?.role === "super_admin" || user?.impersonated;

  if (!showCopilot) return null;

  // If impersonating, the context is strictly the school they are impersonating. 
  // Otherwise, use the URL context if they are browsing a school.
  const activeSchoolId = user?.impersonated ? user.school_id : urlSchoolId;
  const activeSchoolName = user?.impersonated ? user.school_name : urlSchoolName;

  return (
    <>
      <CopilotLauncher onClick={() => setCopilotOpen(true)} />
      <CopilotPanel
        schoolId={activeSchoolId || ""}
        schoolName={activeSchoolName || "Global / Select a school"}
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
      />
    </>
  );
}
