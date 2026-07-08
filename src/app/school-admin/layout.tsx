"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const nav = [
  { label: "Dashboard", href: "/school-admin/dashboard" },
  { label: "School Profile", href: "/school-admin/profile" },
  { label: "Sessions & Terms", href: "/school-admin/sessions" },
  { label: "Classes", href: "/school-admin/classes" },
  { label: "Subjects", href: "/school-admin/subjects" },
  { label: "Teachers", href: "/school-admin/teachers" },
  { label: "Students", href: "/school-admin/students" },
  { label: "Assignments", href: "/school-admin/assignments" },
  { label: "Assessment Config", href: "/school-admin/assessment" },
];

export default function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setEmail(d.email);
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <h2 className="text-h3 font-bold text-primary">SchoolAid</h2>
          <p className="text-caption text-text-muted mt-1">School Admin</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {nav.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full text-left px-4 py-2.5 rounded-sm text-small font-medium ${pathname === item.href || pathname.startsWith(item.href + "/") ? "bg-primary-light text-primary" : "text-text-secondary hover:bg-bg"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-caption text-text-muted truncate">
            {email || "Admin"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
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
