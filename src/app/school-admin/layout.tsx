"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";

type NavItem = { label: string; href: string; exact?: boolean };
type NavGroup = { 
  group: string; 
  items: NavItem[]; 
  collapsible?: boolean;
};

const navStructure: NavGroup[] = [
  {
    group: "OVERVIEW",
    items: [
      { label: "🏠 Dashboard", href: "/school-admin/dashboard" },
    ]
  },
  {
    group: "PEOPLE & ACADEMICS",
    items: [
      { label: "🏛️ Classes", href: "/school-admin/classes" },
      { label: "📚 Subjects", href: "/school-admin/subjects" },
      { label: "🎓 Students", href: "/school-admin/students" },
      { label: "👩‍🏫 Teachers", href: "/school-admin/teachers" },
      { label: "📅 Sessions & Terms", href: "/school-admin/sessions" },
    ]
  },
  {
    group: "ASSESSMENT CONFIG",
    collapsible: true,
    items: [
      { label: "📝 Components", href: "/school-admin/assessment?tab=components", exact: true },
      { label: "💯 Grading Scales", href: "/school-admin/assessment?tab=grading", exact: true },
      { label: "🧠 Psychomotor", href: "/school-admin/assessment?tab=psychomotor", exact: true },
      { label: "❤️ Affective", href: "/school-admin/assessment?tab=affective", exact: true },
    ]
  },
  {
    group: "REPORT CARDS",
    collapsible: true,
    items: [
      { label: "📄 Manage & Review", href: "/school-admin/report-cards" },
      { label: "🎨 Template Settings", href: "/school-admin/templates" },
    ]
  },
  {
    group: "SETTINGS",
    items: [
      { label: "⚙️ School Settings", href: "/school-admin/profile" },
    ]
  }
];

function SchoolAdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [school, setSchool] = useState<{ name: string; logo_url?: string; slug: string } | null>(null);
  const [impersonated, setImpersonated] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        if (d.email) setEmail(d.email);
        if (d.school_name) setSchool({ name: d.school_name, logo_url: d.school_logo, slug: d.school_slug || "" });
        if (d.impersonated) setImpersonated(true);
      }
    }).catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleExitImpersonation = async () => {
    setExiting(true);
    const res = await fetch("/api/auth/exit-impersonation", { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      window.location.href = d.redirect || "/super-admin/dashboard";
    }
    setExiting(false);
  };

  const handleGeneratePassword = async () => {
    setGenerating(true);
    const r = await fetch("/api/auth/change-password", { method: "POST" });
    const d = await r.json();
    if (d.password) setNewPassword(d.password);
    setGenerating(false);
  };

  const sidebar = (
    <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
      <div className="p-5 border-b border-border">
        <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
        {school && <p className="text-caption text-text-muted mt-1 truncate">{school.name}</p>}
      </div>
      <nav className="flex-1 p-3 space-y-4 overflow-auto">
        {navStructure.map(group => (
          <div key={group.group}>
            <p className="px-4 text-xs font-bold text-text-muted mb-1 tracking-wider">{group.group}</p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = item.exact 
                  ? (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")) === item.href 
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                  
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={() => setMenuOpen(false)}
                    className={`block w-full text-left px-4 py-2 rounded-sm text-small font-medium transition-colors ${
                      isActive 
                        ? "bg-primary-light text-primary" 
                        : "text-text-secondary hover:bg-bg hover:text-text-primary"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-border space-y-2">
        {impersonated && (
          <Button variant="warning" size="sm" onClick={handleExitImpersonation} loading={exiting} className="w-full">
            ← Exit Impersonation
          </Button>
        )}
        <p className="text-caption text-text-muted truncate">{email || "Admin"}</p>
        <p className="text-caption text-text-muted font-mono mt-0.5">SchoolAid {APP_VERSION}</p>
        {newPassword ? (
          <div className="p-2 bg-warning-bg border border-warning rounded-sm">
            <p className="text-caption font-bold text-warning">New Password:</p>
            <p className="text-caption font-mono text-warning break-all">{newPassword}</p>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleGeneratePassword} loading={generating} className="w-full text-caption">Generate New Password</Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full">Sign Out</Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Impersonation banner */}
      {impersonated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-warning-bg border-b border-warning px-4 py-2 flex items-center justify-between">
          <p className="text-small text-warning font-semibold">
            ⚠️ You are impersonating {school?.name || "this school"}. All actions are logged.
          </p>
          <Button variant="warning" size="sm" onClick={handleExitImpersonation} loading={exiting}>
            Exit Impersonation
          </Button>
        </div>
      )}

      {/* Mobile hamburger */}
      <div className={`hidden max-tablet:block fixed left-0 right-0 z-40 bg-surface border-b border-border p-3 ${impersonated ? "top-10" : "top-0"}`}>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-primary text-h3">☰</button>
        <span className="ml-3 font-bold text-primary">SchoolAid</span>
      </div>

      {/* Desktop sidebar */}
      <div className={`max-tablet:hidden ${impersonated ? "pt-10" : ""}`}>{sidebar}</div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="hidden max-tablet:block fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative z-10 h-full">{sidebar}</div>
        </div>
      )}

      <main className={`flex-1 overflow-auto ${impersonated ? "pt-10" : ""} max-tablet:pt-14`}>
        <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <SchoolAdminLayoutContent>{children}</SchoolAdminLayoutContent>
    </Suspense>
  );
}
