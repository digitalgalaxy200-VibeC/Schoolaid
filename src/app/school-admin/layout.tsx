"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const nav = [
  { label: "🏠 Dashboard", href: "/school-admin/dashboard" },
  { label: "🏛️ Classes", href: "/school-admin/classes" },
  { label: "📚 Subjects", href: "/school-admin/subjects" },
  { label: "🎓 Students", href: "/school-admin/students" },
  { label: "👩‍🏫 Teachers", href: "/school-admin/teachers" },
  { label: "📅 Sessions & Terms", href: "/school-admin/sessions" },
  { label: "⚙️ Assessment Config", href: "/school-admin/assessment" },
  { label: "⚙️ School Settings", href: "/school-admin/profile" },
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
  const [generating, setGenerating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [school, setSchool] = useState<{ name: string; logo_url?: string; slug: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setEmail(d.email);
        if (d?.impersonated) setImpersonated(true);
      })
      .catch(() => {});

    fetch("/api/school-admin/school")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.name) setSchool(d); })
      .catch(() => {});
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleGeneratePassword = async () => {
    setGenerating(true);
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (d.password) setNewPassword(d.password);
    setGenerating(false);
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

  const SchoolBrand = () => (
    <div className="flex items-center gap-3">
      {school?.logo_url ? (
        <img
          src={school.logo_url}
          alt={school.name}
          className="w-9 h-9 rounded-md object-cover border border-border flex-shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-md bg-primary-light flex items-center justify-center flex-shrink-0">
          <span className="text-primary font-bold text-sm">
            {school?.name?.charAt(0) || "S"}
          </span>
        </div>
      )}
      <div className="min-w-0">
        <p className="font-bold text-text-primary text-sm leading-tight truncate">
          {school?.name || "Loading…"}
        </p>
        <p className="text-caption text-text-muted leading-tight">School Portal</p>
      </div>
    </div>
  );

  const NavItems = () => (
    <>
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
              active
                ? "bg-primary-light text-primary font-semibold"
                : "text-text-secondary hover:bg-bg hover:text-text-primary"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Impersonation Banner */}
      {impersonated && (
        <div className="bg-warning text-warning-foreground px-4 py-2 flex items-center justify-between z-50 shadow-sm shrink-0">
          <p className="text-xs font-semibold">
            🛡️ Impersonating school administrator
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={exitImpersonation}
            loading={exiting}
            className="shadow-sm text-xs"
          >
            Exit
          </Button>
        </div>
      )}

      {/* Mobile Top Header */}
      <header className="tablet:hidden sticky top-0 z-40 bg-surface border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <SchoolBrand />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {menuOpen && (
          <div className="border-t border-border bg-surface shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="p-3 space-y-0.5">
              <NavItems />
            </div>
            <div className="border-t border-border p-4 space-y-3">
              <p className="text-xs text-text-muted truncate">{email || "Admin"}</p>
              {newPassword ? (
                <div className="p-3 bg-warning-bg border border-warning rounded-lg">
                  <p className="text-xs font-bold text-warning">🔑 New Password — Save Now:</p>
                  <p className="text-sm font-mono text-warning font-bold mt-1">{newPassword}</p>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGeneratePassword}
                  loading={generating}
                  className="w-full text-xs"
                >
                  Generate New Password
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="w-full text-xs"
              >
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden tablet:flex w-64 bg-surface border-r border-border flex-col shrink-0">
          <div className="p-5 border-b border-border">
            <SchoolBrand />
          </div>
          <nav className="flex-1 p-3 space-y-0.5 overflow-auto">
            <NavItems />
          </nav>
          <div className="p-4 border-t border-border">
            <p className="text-caption text-text-muted truncate">{email || "Admin"}</p>
            {newPassword ? (
              <div className="mt-2 p-2 bg-warning-bg border border-warning rounded-lg">
                <p className="text-caption font-bold text-warning">🔑 New Password:</p>
                <p className="text-caption font-mono text-warning">{newPassword}</p>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGeneratePassword}
                loading={generating}
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

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-4 tablet:px-6 py-4 tablet:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
