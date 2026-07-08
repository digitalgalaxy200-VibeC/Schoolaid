"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const NAV = [
  { label: "Dashboard", href: "/teacher/dashboard" },
  { label: "My Classes", href: "/teacher/classes" },
  { label: "Scores", href: "/teacher/scores" },
];

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setEmail(d.email);
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Clear any remaining auth cookies client-side
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = eq > -1 ? c.slice(0, eq).trim() : c.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="hidden tablet:flex w-60 bg-surface border-r border-border flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
          <p className="text-caption text-text-muted mt-0.5">Teacher Portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium transition-colors ${
                  active
                    ? "bg-primary-light text-primary"
                    : "text-text-secondary hover:bg-bg hover:text-text-primary"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-caption text-text-muted truncate mb-2">
            {email || "Teacher"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="tablet:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-primary text-h3">SchoolAid</span>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-text-primary p-1"
        >
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current" />
        </button>
      </div>
      {menuOpen && (
        <div className="tablet:hidden fixed top-12 left-0 right-0 z-30 bg-surface border-b border-border shadow-md p-3 space-y-0.5">
          {NAV.map((item) => (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                setMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 rounded-sm text-small font-medium text-text-secondary hover:bg-bg"
            >
              {item.label}
            </button>
          ))}
          <hr className="border-border my-2" />
          <p className="px-4 text-caption text-text-muted">
            {email || "Teacher"}
          </p>
          <button
            onClick={signOut}
            className="w-full text-left px-4 py-2 text-small text-error"
          >
            Sign Out
          </button>
        </div>
      )}

      <main className="flex-1 overflow-auto tablet:mt-0 mt-12">
        <div className="max-w-5xl mx-auto px-4 tablet:px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
