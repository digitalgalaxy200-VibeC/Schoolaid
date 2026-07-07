"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { label: "Dashboard", href: "/teacher/dashboard" },
  { label: "My Classes", href: "/teacher/classes" },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [loading,   setLoading]   = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [menuOpen,  setMenuOpen]  = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || user.app_metadata?.role !== "teacher") {
        router.push("/login");
        return;
      }
      setUserEmail(user.email ?? "");
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-role-teacher border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar */}
      <aside className="hidden tablet:flex w-60 bg-surface border-r border-border flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
          <p className="text-caption text-text-muted mt-0.5">Teacher Portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium transition-colors ${
                  active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg hover:text-text-primary"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-caption text-text-muted truncate mb-2">{userEmail}</p>
          <button onClick={handleSignOut} className="text-small text-error hover:underline">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="tablet:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-primary text-h3">SchoolAid</span>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-primary p-1">
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current mb-1" />
          <span className="block w-5 h-0.5 bg-current" />
        </button>
      </div>
      {menuOpen && (
        <div className="tablet:hidden fixed top-12 left-0 right-0 z-30 bg-surface border-b border-border shadow-md p-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => { router.push(item.href); setMenuOpen(false); }}
              className="w-full text-left px-4 py-2.5 rounded-sm text-small font-medium text-text-secondary hover:bg-bg"
            >
              {item.label}
            </button>
          ))}
          <hr className="border-border my-2" />
          <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-small text-error">Sign Out</button>
        </div>
      )}

      <main className="flex-1 overflow-auto tablet:mt-0 mt-12">
        <div className="max-w-5xl mx-auto px-4 tablet:px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
