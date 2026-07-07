"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

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
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    // We trust middleware.ts for authentication.
    // Just grab the email from localStorage for the UI.
    const email = localStorage.getItem("user-email") || "Admin";
    setUserEmail(email);
    setLoading(false);
  }, []);

  const handleSignOut = async () => {
    // Call the logout API to clear HttpOnly cookies
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("user-email");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

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
              className={`w-full text-left px-4 py-3 rounded-sm text-small font-medium transition-colors ${
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-primary-light text-primary"
                  : "text-text-secondary hover:bg-bg hover:text-text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-caption text-text-muted truncate">{userEmail}</p>
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
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
