"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const nav = [
  { label: "Dashboard", href: "/school-admin/dashboard" },
  { label: "School Profile", href: "/school-admin/profile" },
  { label: "Sessions & Terms", href: "/school-admin/sessions" },
  { label: "Classes", href: "/school-admin/classes" },
  { label: "Subjects", href: "/school-admin/subjects" },
  { label: "Teachers", href: "/school-admin/teachers" },
  { label: "Students", href: "/school-admin/students" },
  { label: "Assignments", href: "/school-admin/assignments" },
  { label: "Assessment Config", href: "/school-admin/assessment" },
];

export default function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [impersonated, setImpersonated] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setEmail(d.email);
        if (d?.impersonated) setImpersonated(true);
      })
      .catch(() => {});
  }, []);

  const handleGeneratePassword = async () => {
    const r = await fetch("/api/auth/change-password", { method: "POST" });
    const d = await r.json();
    if (d.password) setNewPassword(d.password);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const exitImpersonation = async () => {
    setExiting(true);
    const res = await fetch("/api/auth/exit-impersonation", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      router.push(data.redirect || "/super-admin/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {impersonated && (
        <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between z-50 shadow-sm shrink-0">
          <p className="text-small font-semibold">
            🛡️ You are currently impersonating a school administrator.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={exitImpersonation}
            loading={exiting}
            className="shadow-sm"
          >
            Exit Impersonation
          </Button>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
          <div className="p-5 border-b border-border">
            <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
            <p className="text-caption text-text-muted mt-1">School Admin</p>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-auto">
            {nav.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium ${pathname === item.href || pathname.startsWith(item.href + "/") ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-border">
            <p className="text-caption text-text-muted truncate">
              {email || "Admin"}
            </p>
            {newPassword ? (
              <div className="mt-2 p-2 bg-warning-bg border border-warning rounded-sm">
                <p className="text-caption font-bold text-warning">
                  New Password:
                </p>
                <p className="text-caption font-mono text-warning">
                  {newPassword}
                </p>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGeneratePassword}
                className="mt-2 w-full text-caption"
              >
                Generate New Password
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="mt-1 w-full"
            >
              Sign Out
            </Button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
