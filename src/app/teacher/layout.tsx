"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui";

const NAV = [
  { label: "Dashboard", href: "/teacher/dashboard" },
  { label: "Student Marks", href: "/teacher/scores" },
  { label: "Students", href: "/teacher/students" },
];

interface SessionUser {
  email?: string;
  full_name?: string;
  must_change_password?: boolean;
}

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser>({});
  const [schoolName, setSchoolName] = useState("");
  const [schoolLogo, setSchoolLogo] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Forced password change (first login)
  const [forcedPwChanging, setForcedPwChanging] = useState(false);
  const [forcedPwError, setForcedPwError] = useState("");
  const [forcedGeneratedPw, setForcedGeneratedPw] = useState("");

  // Voluntary password change
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [newGeneratedPw, setNewGeneratedPw] = useState("");

  const loadUser = () => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setUser(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadUser();
    fetch("/api/teacher/dashboard").then((r) => r.json()).then((d) => { if (d.school?.name) setSchoolName(d.school.name); if (d.school?.logo_url) setSchoolLogo(d.school.logo_url); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // NOTE: this generates a new unique password server-side rather than
  // accepting a client-chosen one. The change-password API has always
  // ignored a client-supplied password for non-super_admin roles — this
  // layout previously showed a "new password / confirm password" form that
  // implied the typed value would be used, but it was silently discarded,
  // so a teacher who used that form ended up with a different, unknown
  // password. This UI now matches what the API actually does. See
  // docs/CORRECTIONS_SECURITE.md.
  const requestNewPassword = async (): Promise<{ ok: boolean; password?: string; error?: string }> => {
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: d.error || "Failed to generate a new password" };
      return { ok: true, password: d.password };
    } catch {
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };

  const handleForcedChange = async () => {
    setForcedPwError("");
    setForcedPwChanging(true);
    const res = await requestNewPassword();
    setForcedPwChanging(false);
    if (!res.ok) { setForcedPwError(res.error || "Failed"); return; }
    setForcedGeneratedPw(res.password || "");
  };

  const handleVoluntaryChange = async () => {
    setPwErr("");
    setPwMsg("");
    setNewGeneratedPw("");
    setPwChanging(true);
    const res = await requestNewPassword();
    setPwChanging(false);
    if (!res.ok) { setPwErr(res.error || "Failed"); return; }
    setNewGeneratedPw(res.password || "");
    setPwMsg("New password generated! Save it now.");
  };

  const displayName = user.full_name || user.email || "Teacher";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // Force password change screen — mirrors the student portal's gate.
  // Previously absent here, so a teacher's must_change_password flag (set
  // true on every account creation/reset) was never enforced in the UI.
  if (user.must_change_password) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-display font-extrabold text-primary">SchoolAid</h1>
            <p className="text-small text-text-muted mt-1">Teacher Portal</p>
          </div>
          <Card variant="bordered" className="shadow-md">
            <div className="space-y-5 p-1">
              <div>
                <h2 className="text-h3 font-bold">Generate Your Password</h2>
                <p className="text-small text-text-muted mt-1">
                  Welcome{user.full_name ? `, ${user.full_name}` : ""}! For security, please generate a new password before continuing.
                </p>
              </div>
              {forcedGeneratedPw && (
                <div className="bg-warning-bg border border-warning rounded-sm px-4 py-3">
                  <p className="text-small font-bold text-warning">🔑 Your New Password — Save This Now</p>
                  <p className="text-body font-mono text-warning font-bold mt-1">{forcedGeneratedPw}</p>
                  <p className="text-caption text-text-muted mt-2">Write this down. You will need it to log in next time.</p>
                </div>
              )}
              {forcedPwError && (
                <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
                  <p className="text-small text-error font-medium">{forcedPwError}</p>
                </div>
              )}
              {!forcedGeneratedPw ? (
                <Button onClick={handleForcedChange} fullWidth loading={forcedPwChanging}>
                  Generate New Password
                </Button>
              ) : (
                <Button onClick={() => { setForcedGeneratedPw(""); loadUser(); }} fullWidth>
                  I've Saved It — Continue
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex">
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
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium transition-colors ${active ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-bg"}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border space-y-2">
          <p className="text-caption text-text-muted truncate">{displayName}</p>
          <button
            onClick={() => setShowPw(!showPw)}
            className="text-caption text-primary hover:underline"
          >
            Change Password
          </button>
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

      <div className="tablet:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-primary text-h3">{schoolName || "SchoolAid"}</span>
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
          <p className="px-4 text-caption text-text-muted">{displayName}</p>
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
          {showPw && (
            <div className="mb-6">
              <Card variant="bordered" className="shadow-md max-w-md">
                <div className="p-5 space-y-4">
                  <h3 className="text-h3 font-bold">Generate New Password</h3>
                  <p className="text-small text-text-muted">
                    Click below to generate a new unique password for your account.
                  </p>
                  {newGeneratedPw && (
                    <div className="bg-warning-bg border border-warning rounded-sm px-4 py-3">
                      <p className="text-small font-bold text-warning">🔑 Your New Password</p>
                      <p className="text-body font-mono text-warning font-bold mt-1">{newGeneratedPw}</p>
                      <p className="text-caption text-text-muted mt-2">Write this down. You will need it to log in next time.</p>
                    </div>
                  )}
                  {pwErr && (
                    <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
                      <p className="text-small text-error font-medium">
                        {pwErr}
                      </p>
                    </div>
                  )}
                  {pwMsg && !newGeneratedPw && (
                    <div className="bg-success-bg border border-success rounded-sm px-4 py-2">
                      <p className="text-small text-success font-medium">
                        {pwMsg}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    {!newGeneratedPw ? (
                      <Button onClick={handleVoluntaryChange} loading={pwChanging}>
                        Generate New Password
                      </Button>
                    ) : (
                      <Button onClick={() => { setShowPw(false); setNewGeneratedPw(""); setPwMsg(""); }}>
                        Done
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowPw(false);
                        setPwErr("");
                        setPwMsg("");
                        setNewGeneratedPw("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
