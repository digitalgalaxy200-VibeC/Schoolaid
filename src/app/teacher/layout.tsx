"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

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
  const [user, setUser] = useState<{
    email?: string;
    full_name?: string;
    must_change_password?: boolean;
  }>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [generatedPw, setGeneratedPw] = useState("");
  const [newGeneratedPw, setNewGeneratedPw] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setUser(d);
      })
      .catch(() => {});
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

  const handleVoluntaryChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwMsg("");
    setNewGeneratedPw("");
    setPwChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Failed");
        return;
      }
      setNewGeneratedPw(data.password);
      setPwMsg("New password generated! Save it now.");
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwChanging(false);
    }
  };

  const handleForcedChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Failed");
        return;
      }
      setGeneratedPw(data.password);
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwChanging(false);
    }
  };

  const displayName = user.full_name || user.email || "Teacher";

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
                  Welcome{user.full_name ? `, ${user.full_name}` : ""}! For
                  security, please generate a new password before continuing.
                </p>
              </div>
              {generatedPw && (
                <div className="bg-warning-bg border border-warning rounded-sm px-4 py-3">
                  <p className="text-small font-bold text-warning">
                    🔑 Your New Password — Save This Now
                  </p>
                  <p className="text-body font-mono text-warning font-bold mt-1">
                    {generatedPw}
                  </p>
                  <p className="text-caption text-text-muted mt-2">
                    Write this down. You will need it to log in next time.
                  </p>
                </div>
              )}
              {pwError && (
                <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
                  <p className="text-small text-error font-medium">{pwError}</p>
                </div>
              )}
              {!generatedPw ? (
                <Button onClick={handleForcedChangePassword} fullWidth loading={pwChanging}>
                  Generate New Password
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setGeneratedPw("");
                    setUser((u) => ({ ...u, must_change_password: false }));
                  }}
                  fullWidth
                >
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
        <div className="p-4 border-t border-border space-y-2">
          <p className="text-caption text-text-muted truncate">{displayName}</p>
          <button
            onClick={() => setShowChangePw(!showChangePw)}
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
          <p className="px-4 text-caption text-text-muted">{displayName}</p>
          <button
            onClick={() => {
              setShowChangePw(true);
              setMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-small text-primary"
          >
            Change Password
          </button>
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
          {/* Password change modal */}
          {showChangePw && (
            <div className="mb-6">
              <Card variant="bordered" className="shadow-md max-w-md">
                <div className="p-5 space-y-4">
                  <h3 className="text-h3 font-bold">Generate New Password</h3>
                  <p className="text-small text-text-muted">
                    Click below to generate a new unique password for your account.
                  </p>
                  {newGeneratedPw && (
                    <div className="bg-warning-bg border border-warning rounded-sm px-4 py-3">
                      <p className="text-small font-bold text-warning">
                        🔑 Your New Password
                      </p>
                      <p className="text-body font-mono text-warning font-bold mt-1">
                        {newGeneratedPw}
                      </p>
                      <p className="text-caption text-text-muted mt-2">
                        Write this down. You will need it to log in next time.
                      </p>
                    </div>
                  )}
                  {pwError && (
                    <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
                      <p className="text-small text-error font-medium">
                        {pwError}
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
                      <Button onClick={handleVoluntaryChangePw} loading={pwChanging}>
                        Generate New Password
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setShowChangePw(false);
                          setNewGeneratedPw("");
                          setPwMsg("");
                        }}
                      >
                        Done
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowChangePw(false);
                        setPwError("");
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
