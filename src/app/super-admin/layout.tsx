"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { Button, Card, Badge } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";
import { PasswordInput } from "@/components/ui/PasswordInput";

type NavItem = { label: string; href: string };
type NavGroup = { group: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    group: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/super-admin/dashboard" },
    ]
  },
  {
    group: "MANAGEMENT",
    items: [
      { label: "Schools", href: "/super-admin/schools" },
      { label: "Users", href: "/super-admin/users" },
      { label: "Subscriptions", href: "/super-admin/subscriptions" },
    ]
  },
  {
    group: "SYSTEM",
    items: [
      { label: "Reports", href: "/super-admin/reports" },
      { label: "System Health", href: "/super-admin/health" },
      { label: "Settings", href: "/super-admin/settings" },
    ]
  }
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string; full_name?: string; role?: string }>({});
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Password change state
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(NAV_GROUPS.map(g => g.group)));

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUser(data);
      })
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwMsg("");
    if (newPw.length < 4) {
      setPwError("Password must be at least 4 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match");
      return;
    }
    setPwChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Failed");
        return;
      }
      setPwMsg("Password changed successfully");
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => {
        setShowChangePw(false);
        setPwMsg("");
      }, 1500);
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwChanging(false);
    }
  };

  const displayName = user.full_name || user.email || "Admin";

  const NavGroups = ({ collapsed: isCollapsed = false }: { collapsed?: boolean }) => {
    if (isCollapsed) {
      return (
        <div className="space-y-0.5">
          {NAV_GROUPS.flatMap(g => g.items).map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => router.push(item.href)} title={item.label}
                className={`w-full flex justify-center py-2 rounded-sm transition-colors ${active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}>
                <span className="text-sm font-bold">{item.label.charAt(0)}</span>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {NAV_GROUPS.map(group => (
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
              className={`w-full text-left px-3 py-1.5 rounded-sm flex items-center justify-between transition-colors ${group.items.some(item => pathname === item.href || pathname.startsWith(item.href + "/")) ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
            >
              <span className="text-[10px] font-bold tracking-widest uppercase">{group.group}</span>
              <svg className={`w-3 h-3 transition-transform ${expandedGroups.has(group.group) ? "rotate-0" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedGroups.has(group.group) && (
              <div className="space-y-0.5 mt-0.5 ml-1">
                {group.items.map(item => (
                  <button key={item.href} onClick={() => router.push(item.href)}
                    className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium transition-colors ${pathname === item.href || pathname.startsWith(item.href + "/") ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col tablet:flex-row">
      {/* Mobile Top Header */}
      <header className="tablet:hidden sticky top-0 z-40 bg-surface border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-h3 font-bold text-primary leading-tight">
              SchoolAid
            </h2>
            <p className="text-caption text-text-muted leading-tight">
              Super Admin
            </p>
          </div>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-text-secondary hover:bg-bg transition-colors"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {menuOpen && (
          <div className="border-t border-border bg-surface shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="p-3">
              <NavGroups />
            </div>
            <div className="border-t border-border p-4 space-y-2">
              <p className="text-caption text-text-muted truncate">
                {displayName}
              </p>
              <button
                onClick={() => setShowChangePw(true)}
                className="text-caption text-primary hover:underline"
              >
                Change Password
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="w-full"
              >
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Desktop Sidebar */}
      <aside className={`hidden tablet:flex bg-surface border-r border-border flex-col shrink-0 transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        <div className={`p-5 border-b border-border flex items-center ${collapsed ? "justify-center" : ""}`}>
          {!collapsed && (
            <>
              <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
              <p className="text-caption text-text-muted mt-1">Super Admin</p>
            </>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="text-text-muted hover:text-text-primary p-1 shrink-0 ml-auto" title={collapsed ? "Expand" : "Collapse"}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed 
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>
        <nav className={`flex-1 p-3 overflow-auto ${collapsed ? "px-1" : ""}`}>
          <NavGroups collapsed={collapsed} />
        </nav>
        <div className={`p-4 border-t border-border ${collapsed ? "text-center" : ""}`}>
          {!collapsed && <p className="text-caption text-text-muted truncate">{displayName}</p>}
          {!collapsed && <p className="text-caption text-text-muted font-mono mt-0.5">SchoolAid {APP_VERSION}</p>}
          {!collapsed && (
            <button onClick={() => setShowChangePw(true)} className="text-caption text-primary hover:underline mt-1">Change Password</button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="mt-2 w-full">{collapsed ? "Out" : "Sign Out"}</Button>
        </div>
      </aside>

      {/* Password change modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Card variant="default" className="shadow-lg w-full max-w-sm mx-4">
            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <h3 className="text-h3 font-bold">Change Password</h3>
              <PasswordInput
                label="New Password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 4 characters"
                required
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter password"
                required
              />
              {pwError && (
                <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
                  <p className="text-small text-error font-medium">{pwError}</p>
                </div>
              )}
              {pwMsg && (
                <div className="bg-success-bg border border-success rounded-sm px-4 py-2">
                  <p className="text-small text-success font-medium">{pwMsg}</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button type="submit" loading={pwChanging}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowChangePw(false);
                    setPwError("");
                    setPwMsg("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 tablet:px-6 py-4 tablet:py-6">
          {children}
        </div>
      </main>

    </div>
  );
}
