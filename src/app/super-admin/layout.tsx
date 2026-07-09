"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";

const navItems = [
  { label: "Dashboard", href: "/super-admin/dashboard" },
  { label: "Schools", href: "/super-admin/schools" },
  { label: "Support Logs", href: "/super-admin/support-logs" },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string; full_name?: string }>({});

  // Password change state
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

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

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-64 bg-surface border-r border-border flex flex-col">
        <div className="p-5 border-b border-border">
          <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
          <p className="text-caption text-text-muted mt-1">Super Admin</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full text-left px-4 py-3 rounded-sm text-small font-medium ${pathname === item.href || pathname.startsWith(item.href + "/") ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-caption text-text-muted truncate">{displayName}</p>
          <button
            onClick={() => setShowChangePw(true)}
            className="text-caption text-primary hover:underline mt-1"
          >
            Change Password
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="mt-2 w-full"
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Password change modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Card variant="bordered" className="shadow-lg w-full max-w-sm mx-4">
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
        <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
