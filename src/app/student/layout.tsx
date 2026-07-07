"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { label: "My Results", href: "/student/dashboard" },
  { label: "Download PDF", href: "/student/results" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [loading,     setLoading]     = useState(true);
  const [studentName, setStudentName] = useState("");
  const [schoolName,  setSchoolName]  = useState("");
  const [menuOpen,    setMenuOpen]    = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || user.app_metadata?.role !== "student") {
        router.push("/auth/login");
        return;
      }

      const studentId = user.app_metadata?.student_id as string;
      const schoolId  = user.app_metadata?.school_id as string;

      const [studentRes, schoolRes] = await Promise.all([
        supabase.from("students").select("first_name, last_name").eq("id", studentId).single(),
        supabase.from("schools").select("school_name").eq("id", schoolId).single(),
      ]);

      if (studentRes.data) setStudentName(`${studentRes.data.first_name} ${studentRes.data.last_name}`);
      if (schoolRes.data)  setSchoolName(schoolRes.data.school_name);
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top header for students — simple, no sidebar */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <span className="font-bold text-primary text-h3">SchoolAid</span>
            <span className="text-caption text-text-muted ml-2 hidden tablet:inline">· {schoolName}</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden tablet:flex items-center gap-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={`px-4 py-2 rounded-sm text-small font-medium transition-colors ${
                      active ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <button onClick={() => setMenuOpen(!menuOpen)} className="tablet:hidden text-text-primary p-1">
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current" />
            </button>
            <button onClick={handleSignOut} className="hidden tablet:block text-small text-error hover:underline">
              Sign Out
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="tablet:hidden border-t border-border p-3 space-y-1">
            {navItems.map((item) => (
              <button key={item.href} onClick={() => { router.push(item.href); setMenuOpen(false); }}
                className="w-full text-left px-4 py-2.5 rounded-sm text-small font-medium text-text-secondary hover:bg-bg"
              >
                {item.label}
              </button>
            ))}
            <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-small text-error">Sign Out</button>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Student greeting */}
        <div className="mb-5">
          <p className="text-small text-text-muted">Signed in as</p>
          <p className="text-body font-semibold text-text-primary">{studentName}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
