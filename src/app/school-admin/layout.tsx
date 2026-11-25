"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { versionLabel } from "@/lib/version";
import { TopBar } from "@/components/school-admin/TopBar";
import { SectionTabs } from "@/components/school-admin/SectionTabs";
import {
  NAV_SECTIONS,
  bottomNavItems,
  sectionForPath,
  visibleNavSections,
  visibleSectionTabs,
} from "@/lib/school-admin/navigation";

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

function SchoolAdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [school, setSchool] = useState<{ name: string; logo_url?: string; slug: string } | null>(null);
  // Whether this school has the Website Engine. Advisory only: it hides a menu
  // entry. The screens and their API enforce the flag themselves.
  const [websiteEnabled, setWebsiteEnabled] = useState(false);
  const [cbtEnabled, setCbtEnabled] = useState(false);
  const [impersonated, setImpersonated] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // True when the profile is below the 50% gate at the last read.
  const [profileGate, setProfileGate] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        if (d.email) setEmail(d.email);
        if (d.school_name) setSchool({ name: d.school_name, logo_url: d.school_logo, slug: d.school_slug || "" });
        if (d.impersonated) setImpersonated(true);
        // The 50% gate. The school-admin profile page is where it is completed.
        if (!d.impersonated && d.profile_complete === false) setProfileGate(true);
      }
    }).catch(() => {});
  }, []);

  // Re-checked on every navigation so a deep link or a bookmark cannot skip the
  // gate. The profile page itself is exempt, or this would loop.
  useEffect(() => {
    if (profileGate && pathname !== "/school-admin/profile") {
      router.replace("/school-admin/profile");
    }
  }, [profileGate, pathname, router]);

  // Saving a profile that reaches the gate clears the flag here, so the next
  // navigation does not bounce the admin back to the settings page.
  useEffect(() => {
    const onCompleted = () => setProfileGate(false);
    window.addEventListener("profile-completed", onCompleted);
    return () => window.removeEventListener("profile-completed", onCompleted);
  }, []);

  useEffect(() => {
    fetch("/api/school-admin/website/status")
      .then(r => (r.ok ? r.json() : null))
      .then(d => setWebsiteEnabled(d?.enabled === true))
      .catch(() => {});

    fetch("/api/school-admin/cbt/status")
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCbtEnabled(d?.enabled === true))
      .catch(() => {});
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

  const visibleSections = visibleNavSections(NAV_SECTIONS, {
    websiteEnabled,
    cbtEnabled,
    impersonated,
  });
  const activeSectionKey = sectionForPath(pathname);

  useEffect(() => {
    if (activeSectionKey) {
      setExpandedSection(activeSectionKey);
    }
  }, [activeSectionKey]);
  const activeSectionVisible = visibleSections.some(
    (section) => section.key === activeSectionKey,
  );
  const tabs =
    activeSectionKey && activeSectionVisible
      ? visibleSectionTabs(activeSectionKey, { websiteEnabled, cbtEnabled, impersonated })
      : [];
  const activeSectionLabel =
    NAV_SECTIONS.find((section) => section.key === activeSectionKey)?.label ?? "";

  /**
   * The phone bottom bar names its destinations BY HREF, never by index.
   *
   * It used to read `navStructure[1].items[0]`, which made it silently depend on
   * the order of the groups: adding one group moved every later entry to a
   * different index and the whole school-admin area crashed. A lookup cannot be
   * broken by re-ordering.
   */
  const bottomItems = bottomNavItems(NAV_SECTIONS);

  const sidebar = (
    <aside className={`bg-surface border-r border-border flex flex-col shrink-0 h-full transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
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
        <button onClick={() => setCollapsed(!collapsed)} className="max-tablet:hidden text-text-muted hover:text-text-primary p-1 shrink-0" title={collapsed ? "Expand" : "Collapse"}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            }
          </svg>
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {visibleSections.map((section) => {
          const isActive = activeSectionKey === section.key;
          const subItems = visibleSectionTabs(section.key, {
            websiteEnabled,
            cbtEnabled,
            impersonated,
          });
          const hasSubItems = subItems.length > 0 && !collapsed;
          const isExpanded = expandedSection === section.key;

          if (!hasSubItems) {
            return (
              <Link
                key={section.key}
                href={section.href}
                prefetch={true}
                title={collapsed ? section.label : undefined}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-sm text-small font-medium transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-primary-light text-primary"
                    : "text-text-secondary hover:bg-bg hover:text-text-primary"
                }`}
              >
                <NavIcon d={section.icon} />
                {!collapsed && section.label}
              </Link>
            );
          }

          return (
            <div key={section.key} className="space-y-0.5">
              <button
                type="button"
                onClick={() =>
                  setExpandedSection((prev) => (prev === section.key ? null : section.key))
                }
                aria-expanded={isExpanded}
                className={`flex items-center justify-between gap-2 w-full text-left px-3 py-2.5 rounded-sm text-small font-medium transition-colors ${
                  isActive
                    ? "bg-primary-light text-primary"
                    : "text-text-secondary hover:bg-bg hover:text-text-primary"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <NavIcon d={section.icon} />
                  <span className="truncate">{section.label}</span>
                </span>
                <svg
                  className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="ml-4 pl-3 border-l border-border space-y-0.5 py-0.5">
                  {subItems.map((tab) => {
                    const isTabActive =
                      pathname === tab.href || pathname.startsWith(tab.href + "/");
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        prefetch={true}
                        onClick={() => setMenuOpen(false)}
                        className={`block w-full text-left px-3 py-2 rounded-sm text-caption font-medium transition-colors ${
                          isTabActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-text-secondary hover:bg-bg hover:text-text-primary"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className={`border-t border-border ${collapsed ? "p-2 space-y-2" : "p-4 space-y-3"}`}>
        {!collapsed && (
          <>
            <p className="text-caption text-text-secondary font-medium truncate">{email || "Admin"}</p>
            <p className="text-caption text-text-muted truncate">{versionLabel()}</p>
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSignOut}
          title="Sign out"
          className={collapsed ? "w-full justify-center px-0" : "w-full justify-start"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && "Sign Out"}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="h-[100dvh] bg-bg flex flex-col overflow-hidden">
      {/* Impersonation banner — one sign, in the same place on every screen.
          The duplicate Exit button in the sidebar footer is gone; two exits made
          neither feel authoritative, and the footer one sat below the fold. */}
      {impersonated && (
        <div className="sticky top-0 z-50 bg-warning-bg border-b border-warning px-4 py-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption tablet:text-small text-warning font-semibold">
              Viewing {school?.name || "this school"} as Super Admin. All actions are logged.
            </p>
            <Button
              variant="warning"
              size="sm"
              onClick={handleExitImpersonation}
              loading={exiting}
              className="shrink-0"
            >
              Exit impersonation
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <div className="max-tablet:hidden h-full">{sidebar}</div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <TopBar
            schoolName={school?.name}
            schoolSlug={school?.slug}
            schoolLogo={school?.logo_url}
            email={email}
            onOpenMenu={() => { setCollapsed(false); setMenuOpen(true); }}
            onSignOut={handleSignOut}
          />

          <main className="flex-1 overflow-auto max-tablet:pb-16">
            <div className="max-w-6xl mx-auto px-4 py-5 tablet:px-6 tablet:py-6">
              {tabs.length > 0 && (
                <SectionTabs label={activeSectionLabel} tabs={tabs} pathname={pathname} />
              )}
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile drawer (for items not in bottom nav) */}
      {menuOpen && (
        <div className="hidden max-tablet:block fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative z-10 h-full w-[280px] max-w-[80vw]">{sidebar}</div>
        </div>
      )}

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="hidden max-tablet:block fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {bottomItems.map((section) => {
            const isActive = activeSectionKey === section.key;
            return (
              <Link key={section.href} href={section.href} prefetch={true}
                className={`flex flex-col items-center justify-center gap-0.5 h-full px-3 min-w-0 flex-1 transition-colors ${isActive ? "text-primary" : "text-text-muted"}`}>
                <NavIcon d={section.icon} />
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-primary" : ""}`}>{section.label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </Link>
            );
          })}
          {/* Menu Toggle in Bottom Nav */}
          <button onClick={() => { setCollapsed(false); setMenuOpen(true); }} className="flex flex-col items-center justify-center gap-0.5 h-full px-3 min-w-0 flex-1 transition-colors text-text-muted">
             <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
             </svg>
             <span className="text-[10px] font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return <SchoolAdminLayoutContent>{children}</SchoolAdminLayoutContent>;
}
