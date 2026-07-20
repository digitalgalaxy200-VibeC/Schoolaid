"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

const NAV = [
  { label: "Home", href: "/teacher/dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { label: "Marks", href: "/teacher/scores", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { label: "Report Card", href: "/teacher/report-card", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { label: "Students", href: "/teacher/students", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
];

function NavIcon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-primary" : "text-text-muted"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
    </svg>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string; full_name?: string }>({});
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setUser(d); }).catch(() => {});
    fetch("/api/teacher/dashboard").then((r) => r.json()).then((d) => {
      if (d.school?.name) setSchoolName(d.school.name);
      if (d.school?.logo_url) setSchoolLogo(d.school.logo_url);
    }).catch(() => {});
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = eq > -1 ? c.slice(0, eq).trim() : c.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    router.push("/login");
  };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (newPw.length < 4) { setPwErr("Password must be at least 4 characters"); return; }
    if (newPw !== confirmPw) { setPwErr("Passwords do not match"); return; }
    setPwChanging(true);
    try {
      const r = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: newPw }) });
      const d = await r.json();
      if (!r.ok) { setPwErr(d.error || "Failed"); return; }
      setPwMsg("Password changed"); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setShowPw(false); setPwMsg(""); }, 1500);
    } catch { setPwErr("Something went wrong"); }
    finally { setPwChanging(false); }
  };

  const displayName = user.full_name || user.email || "Teacher";

  return (
    <div className="min-h-screen bg-bg flex flex-col tablet:flex-row">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden tablet:flex w-60 bg-surface border-r border-border flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            {schoolLogo && <img src={schoolLogo} alt="" className="w-8 h-8 rounded object-contain bg-white border border-border" />}
            <div>
              <h2 className="text-h3 font-bold text-primary">{schoolName || "SchoolAid"}</h2>
              <p className="text-caption text-text-muted mt-0.5">Teacher Portal</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium transition-colors flex items-center gap-3 ${active ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg"}`}>
                <NavIcon d={item.icon} active={active} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border space-y-2">
          <p className="text-caption text-text-muted truncate">{displayName}</p>
          <button onClick={() => setShowPw(!showPw)} className="text-caption text-primary hover:underline">Change Password</button>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full">Sign Out</Button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="tablet:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-primary text-h3 truncate mr-2">{schoolName || "SchoolAid"}</span>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-primary p-1">
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current" />
        </button>
      </div>

      {/* ── Mobile Slide-down Menu ── */}
      {menuOpen && (
        <div className="tablet:hidden fixed top-12 left-0 right-0 z-30 bg-surface border-b border-border shadow-md p-3 space-y-0.5">
          {NAV.map((item) => (
            <button key={item.href} onClick={() => { router.push(item.href); setMenuOpen(false); }}
              className="w-full text-left px-4 py-2.5 rounded-sm text-small font-medium text-text-secondary hover:bg-bg flex items-center gap-3">
              <NavIcon d={item.icon} active={false} />
              {item.label}
            </button>
          ))}
          <hr className="border-border my-2" />
          <p className="px-4 text-caption text-text-muted">{displayName}</p>
          <button onClick={signOut} className="w-full text-left px-4 py-2 text-small text-error">Sign Out</button>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto tablet:mt-0 mt-12 mb-14 tablet:mb-0">
        <div className="max-w-3xl mx-auto px-4 tablet:px-6 py-4 tablet:py-6">
          {showPw && (
            <div className="mb-6">
              <Card variant="bordered" className="shadow-md max-w-md">
                <form onSubmit={handleChangePw} className="p-5 space-y-4">
                  <h3 className="text-h3 font-bold">Change Password</h3>
                  <PasswordInput label="New Password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 4 characters" required />
                  <PasswordInput label="Confirm Password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Re-enter password" required />
                  {pwErr && <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">{pwErr}</p></div>}
                  {pwMsg && <div className="bg-success-bg border border-success rounded-sm px-4 py-2"><p className="text-small text-success font-medium">{pwMsg}</p></div>}
                  <div className="flex gap-3">
                    <Button type="submit" loading={pwChanging}>Save</Button>
                    <Button variant="ghost" onClick={() => { setShowPw(false); setPwErr(""); setPwMsg(""); }}>Cancel</Button>
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
          {NAV.map((item) => {
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
