"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";

type NavItem = { label: string; href: string; exact?: boolean; icon: string };
type NavGroup = { 
  group: string; 
  items: NavItem[];
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const navStructure: NavGroup[] = [
  {
    group: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/school-admin/dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
    ]
  },
  {
    group: "PEOPLE & ACADEMICS",
    items: [
      { label: "Classes", href: "/school-admin/classes", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
      { label: "Subjects", href: "/school-admin/subjects", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
      { label: "Students", href: "/school-admin/students", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
      { label: "Teachers", href: "/school-admin/teachers", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
      { label: "Sessions & Terms", href: "/school-admin/sessions", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    ]
  },
  {
    group: "ASSESSMENT CONFIG",
    items: [
      { label: "Components", href: "/school-admin/assessment?tab=components", exact: true, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
      { label: "Grading Scales", href: "/school-admin/assessment?tab=grading", exact: true, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { label: "Psychomotor", href: "/school-admin/assessment?tab=psychomotor", exact: true, icon: "M13 10V3L4 14h7v7l9-11h-7z" },
      { label: "Affective", href: "/school-admin/assessment?tab=affective", exact: true, icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
      { label: "Academic Levels", href: "/school-admin/academic-levels", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    ]
  },
  {
    group: "REPORT CARDS",
    items: [
      { label: "Manage & Review", href: "/school-admin/report-cards", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      { label: "Template Settings", href: "/school-admin/templates", icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" },
    ]
  },
  {
    group: "FINANCE",
    items: [
      { label: "Finance", href: "/school-admin/finance", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    ]
  },
  {
    group: "SETTINGS",
    items: [
      { label: "School Settings", href: "/school-admin/profile", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
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
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(navStructure.map(g => g.group)));

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

  const sidebar = (
    <aside className={`bg-surface border-r border-border flex flex-col shrink-0 transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
      <div className={`p-5 border-b border-border flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
        {!collapsed && school?.logo_url ? (
          <img src={school.logo_url} alt={school.name} className="w-9 h-9 rounded-md object-cover border border-border flex-shrink-0" />
        ) : !collapsed ? (
          <div className="w-9 h-9 rounded-md bg-primary-light flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-sm">{school?.name?.charAt(0) || "S"}</span>
          </div>
        ) : null}
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-text-primary text-sm leading-tight truncate">{school?.name || "SchoolAid"}</p>
            <p className="text-caption text-text-muted leading-tight">School Portal</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="text-text-muted hover:text-text-primary p-1 shrink-0" title={collapsed ? "Expand" : "Collapse"}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {collapsed 
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            }
          </svg>
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {!collapsed && navStructure.map(group => (
          <div key={group.group}>
            <button
              onClick={() => {
                setExpandedGroups(prev => {
                  const next = new Set(prev);
                  if (next.has(group.group)) next.delete(group.group);
                  else next.add(group.group);
                  return next;
                });
              }}
              className={`w-full text-left px-3 py-1.5 rounded-sm flex items-center justify-between transition-colors ${group.items.some(item => (item.exact ? (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")) === item.href : pathname === item.href || pathname.startsWith(item.href + "/"))) ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
            >
              <span className="text-xs font-bold tracking-wider">{group.group}</span>
              <svg className={`w-3 h-3 transition-transform ${expandedGroups.has(group.group) ? "rotate-0" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedGroups.has(group.group) && (
              <div className="space-y-0.5 mt-0.5 ml-1">
                {group.items.map(item => {
                  const isActive = item.exact 
                    ? (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")) === item.href 
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href} prefetch={true} onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-sm text-small font-medium transition-colors ${
                        isActive ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"
                      }`}
                    >
                      <NavIcon d={item.icon} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {/* Collapsed mode: just icons */}
        {collapsed && navStructure.flatMap(g => g.items).map(item => {
          const isActive = item.exact 
            ? (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")) === item.href 
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} prefetch={true} title={item.label}
              className={`flex justify-center py-2 rounded-sm transition-colors ${isActive ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}>
              <NavIcon d={item.icon} />
            </Link>
          );
        })}
      </nav>
      <div className={`p-4 border-t border-border ${collapsed ? "text-center space-y-2" : "space-y-3"}`}>
        {impersonated && (
          <Button variant="warning" size="sm" onClick={handleExitImpersonation} loading={exiting} className="w-full">
            {collapsed ? "←" : "← Exit Impersonation"}
          </Button>
        )}
        {!collapsed && (
          <>
            <p className="text-caption text-text-secondary font-medium truncate">{email || "Admin"}</p>
            <p className="text-[10px] text-text-muted font-mono">SchoolAid v{APP_VERSION}</p>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && "Sign Out"}
        </Button>
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
      <div className={`hidden max-tablet:block fixed left-0 right-0 z-40 bg-surface border-b border-border px-3 py-3 ${impersonated ? "top-10" : "top-0"}`}>
        <div className="flex items-center gap-2">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-primary text-h3 shrink-0">☰</button>
          {school?.logo_url && (
            <img
              src={school.logo_url}
              alt=""
              className="w-6 h-6 rounded object-contain bg-white border border-border flex-shrink-0"
            />
          )}
          <span className="font-bold text-primary truncate">{school?.name || "SchoolAid"}</span>
        </div>
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
