"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

interface SessionUser {
  email?: string;
  full_name?: string;
  role?: string;
  school_id?: string;
  must_change_password?: boolean;
}

const navItems = [
  { label: "Dashboard", href: "/student/dashboard" },
  { label: "My Results", href: "/student/results" },
];

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [school, setSchool] = useState<{ name: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Voluntary password change (not forced)
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const loadUser = () => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error("Not authenticated");
        return r.json();
      })
      .then(async (data) => {
        if (data.role !== "student") {
          router.push("/login");
          return;
        }
        setUser(data);

        if (data.school_id) {
          fetch("/api/student/school-info")
            .then((r) => r.json())
            .then((s) => setSchool(s))
            .catch(() => {});
        }

        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  };

  useEffect(() => {
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = eq > -1 ? c.slice(0, eq).trim() : c.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    router.push("/login");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 4) {
      setPasswordError("Password must be at least 4 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPasswordError(data.error || "Failed to change password");
        setChangingPassword(false);
        return;
      }

      // Reload user info (must_change_password should now be false)
      loadUser();
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("Something went wrong. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleVoluntaryChangePw = async (e: React.FormEvent) => {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  // Force password change screen
  if (user?.must_change_password) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-display font-extrabold text-primary">
              SchoolAid
            </h1>
            <p className="text-small text-text-muted mt-1">Student Portal</p>
          </div>
          <Card variant="bordered" className="shadow-md">
            <form onSubmit={handleChangePassword} className="space-y-5 p-1">
              <div>
                <h2 className="text-h3 font-bold">Set Your Password</h2>
                <p className="text-small text-text-muted mt-1">
                  Welcome{user.full_name ? `, ${user.full_name}` : ""}! For
                  security, please create a new password before continuing.
                </p>
              </div>
              <PasswordInput
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 4 characters"
                required
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
              />
              {passwordError && (
                <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
                  <p className="text-small text-error font-medium">
                    {passwordError}
                  </p>
                </div>
              )}
              <Button type="submit" fullWidth loading={changingPassword}>
                Set Password &amp; Continue
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <span className="font-bold text-primary text-h3">SchoolAid</span>
            {school && (
              <span className="text-caption text-text-muted ml-2 hidden tablet:inline">
                · {school.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden tablet:flex items-center gap-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={`px-4 py-2 rounded-sm text-small font-medium transition-colors ${
                      active
                        ? "bg-role-student/10 text-role-student"
                        : "text-text-secondary hover:bg-bg"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="tablet:hidden text-text-primary p-1"
            >
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current" />
            </button>
            <button
              onClick={handleSignOut}
              className="hidden tablet:block text-small text-error hover:underline"
            >
              Sign Out
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="tablet:hidden border-t border-border p-3 space-y-1">
            {navItems.map((item) => (
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
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-small text-error"
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {user && (
          <div className="mb-5">
            <p className="text-small text-text-muted">Signed in as</p>
            <p className="text-body font-semibold text-text-primary">
              {user.full_name || user.email || "Student"}
            </p>
            {!showChangePw && (
              <button
                onClick={() => setShowChangePw(true)}
                className="text-caption text-primary hover:underline mt-1"
              >
                Change Password
              </button>
            )}
          </div>
        )}

        {showChangePw && (
          <div className="mb-6">
            <Card variant="bordered" className="shadow-md max-w-md">
              <form
                onSubmit={handleVoluntaryChangePw}
                className="p-5 space-y-4"
              >
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
                    <p className="text-small text-error font-medium">
                      {pwError}
                    </p>
                  </div>
                )}
                {pwMsg && (
                  <div className="bg-success-bg border border-success rounded-sm px-4 py-2">
                    <p className="text-small text-success font-medium">
                      {pwMsg}
                    </p>
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
        {children}
      </main>
    </div>
  );
}
