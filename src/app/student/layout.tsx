"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";

interface SessionUser {
  email?: string;
  full_name?: string;
  role?: string;
  school_id?: string;
  must_change_password?: boolean;
}

interface StudentInfo {
  full_name?: string;
  class_name?: string;
  photo_url?: string | null;
}

interface SchoolInfo {
  name?: string;
  logo_url?: string | null;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/student/dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { label: "Results", href: "/student/results", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { label: "Profile", href: "/student/profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

function NavIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-primary" : "text-text-muted"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
    </svg>
  );
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const loadUser = () => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error("Not authenticated");
        return r.json();
      })
      .then(async (data) => {
        if (data.role !== "student") { router.push("/login"); return; }
        if (data.must_change_password) { router.push("/change-password"); return; }
        setUser(data);

        if (data.school_id) {
          Promise.all([
            fetch("/api/student/school-info").then(r => r.json()).catch(() => null),
            fetch("/api/student/profile").then(r => r.json()).catch(() => null),
          ]).then(([s, p]) => {
            if (s) setSchool(s);
            if (p) setStudent(p);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch(() => router.push("/login"));
  };

  useEffect(() => { loadUser(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = eq > -1 ? c.slice(0, eq).trim() : c.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    router.push("/login");
  };


  // Voluntary password change
  const handleVoluntaryChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(""); setPwMsg("");
    if (newPw.length < 4) { setPwError("Password must be at least 4 characters"); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    setPwChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: newPw }) });
      const d = await res.json();
      if (!res.ok) { setPwError(d.error || "Failed"); return; }
      setPwMsg("Password changed successfully");
      setNewPw(""); setConfirmPw("");
      setTimeout(() => { setShowChangePw(false); setPwMsg(""); }, 1500);
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwChanging(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }



  // ── Main Layout ──────────────────────────────────────────
  const displayName = student?.full_name || user?.full_name || user?.email || "Student";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="min-h-screen bg-bg flex flex-col tablet:flex-row">
      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden tablet:flex bg-surface border-r border-border flex-col shrink-0 transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}>
        {/* School branding */}
        <div className={`p-5 border-b border-border flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          {school?.logo_url && !collapsed && (
            <img src={school.logo_url} alt="" className="w-8 h-8 rounded object-contain bg-white border border-border shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-h3 font-bold text-primary truncate">{school?.name || "School Portal"}</h2>
              <p className="text-caption text-text-muted mt-0.5">Student Portal</p>
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

        {/* Student info */}
        {!collapsed && (
          <div className="px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              {student?.photo_url ? (
                <img src={student.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border border-border shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center text-small font-bold text-primary shrink-0">
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-small font-semibold text-text-primary truncate">{firstName}</p>
                {student?.class_name && (
                  <p className="text-caption text-text-muted truncate">{student.class_name}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return collapsed ? (
              <button key={item.href} onClick={() => router.push(item.href)} title={item.label}
                className={`w-full flex justify-center py-2 rounded-sm transition-colors ${active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}>
                <NavIcon d={item.icon} active={active} />
              </button>
            ) : (
              <button key={item.href} onClick={() => router.push(item.href)}
                className={`w-full text-left px-3 py-2.5 rounded-sm text-small font-medium transition-colors flex items-center gap-3 ${active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}>
                <NavIcon d={item.icon} active={active} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`p-4 border-t border-border ${collapsed ? "text-center" : "space-y-2"}`}>
          {!collapsed && <p className="text-caption text-text-muted truncate">{displayName}</p>}
          {!collapsed && <p className="text-caption text-text-muted font-mono mt-0.5">SchoolAid {APP_VERSION}</p>}
          {!collapsed && (
            <button onClick={() => setShowChangePw(!showChangePw)} className="text-caption text-primary hover:underline block">
              Change Password
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full">Sign Out</Button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="tablet:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {school?.logo_url && (
            <img src={school.logo_url} alt="" className="w-6 h-6 rounded object-contain bg-white border border-border shrink-0" />
          )}
          <span className="font-bold text-primary text-h3 truncate">{school?.name || "School Portal"}</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-primary p-1 shrink-0">
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current" />
        </button>
      </div>

      {/* ── Mobile Slide-down Menu ── */}
      {menuOpen && (
        <div className="tablet:hidden fixed top-12 left-0 right-0 z-30 bg-surface border-b border-border shadow-md p-3">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-border">
            {student?.photo_url ? (
              <img src={student.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-small font-bold text-primary shrink-0">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-small font-semibold text-text-primary">{displayName}</p>
              {student?.class_name && <p className="text-caption text-text-muted">{student.class_name}</p>}
            </div>
          </div>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => { router.push(item.href); setMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-sm text-small font-medium flex items-center gap-3 ${active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg"}`}>
                <NavIcon d={item.icon} active={active} />
                {item.label}
              </button>
            );
          })}
          <hr className="border-border my-2" />
          <button onClick={() => { setShowChangePw(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2.5 text-small text-primary hover:bg-bg rounded-sm">
            🔒 Change Password
          </button>
          <button onClick={signOut} className="w-full text-left px-3 py-2 text-small text-error">
            Sign Out
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto tablet:mt-0 mt-12 mb-14 tablet:mb-0">
        <div className="max-w-3xl mx-auto px-4 tablet:px-6 py-4 tablet:py-6">
          {/* Change Password Card */}
          {showChangePw && (
            <div className="mb-6">
              <Card variant="default" className="shadow-md max-w-md">
                <form onSubmit={handleVoluntaryChangePw} className="p-5 space-y-4">
                  <h3 className="text-h3 font-bold">Change Password</h3>
                  <div className="space-y-1">
                    <label className="text-small font-semibold text-text-secondary">New Password</label>
                    <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                      className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface" placeholder="At least 4 characters" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-small font-semibold text-text-secondary">Confirm Password</label>
                    <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                      className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface" placeholder="Re-enter password" required />
                  </div>
                  {pwError && <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">{pwError}</p></div>}
                  {pwMsg && <div className="bg-success-bg border border-success rounded-sm px-4 py-2"><p className="text-small text-success font-medium">{pwMsg}</p></div>}
                  <div className="flex gap-3">
                    <Button type="submit" loading={pwChanging}>Save</Button>
                    <Button variant="ghost" onClick={() => { setShowChangePw(false); setPwError(""); setPwMsg(""); setNewPw(""); setConfirmPw(""); }}>Cancel</Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation Bar ── */}
      <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className={`flex flex-col items-center justify-center gap-0.5 h-full px-3 min-w-0 flex-1 transition-colors ${active ? "text-primary" : "text-text-muted"}`}>
                <NavIcon d={item.icon} active={active} />
                <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
