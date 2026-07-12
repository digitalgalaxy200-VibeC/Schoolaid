"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className={`ml-2 px-3 py-1 rounded-sm text-caption font-semibold transition-all duration-150 ${
        copied
          ? "bg-success text-white"
          : "bg-primary-light text-primary hover:bg-primary hover:text-white"
      }`}
    >
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

export default function SchoolAdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [school, setSchool] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/school-admin/classes").then((r) => r.json()),
      fetch("/api/school-admin/teachers?limit=1").then((r) => r.json()),
      fetch("/api/school-admin/students?limit=1").then((r) => r.json()),
      fetch("/api/school-admin/school").then((r) => r.json()),
    ]).then(([classes, teachers, students, schoolData]) => {
      setStats({
        classes: Array.isArray(classes) ? classes.length : 0,
        teachers: teachers?.total ?? (Array.isArray(teachers) ? teachers.length : 0),
        students: students?.total ?? (Array.isArray(students) ? students.length : 0),
      });
      setSchool(schoolData);
    });
  }, []);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "https://schoolaid-b1fa.vercel.app";

  const loginUrl = school?.slug
    ? `${baseUrl}/school/${school.slug}/login`
    : `${baseUrl}/login`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">
          {school?.name ? `${school.name} Dashboard` : "School Dashboard"}
        </h1>
        {school?.motto && (
          <p className="text-small text-text-muted italic mt-1">"{school.motto}"</p>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-primary">
            {stats?.classes ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Classes
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-accent">
            {stats?.teachers ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Teachers
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-success">
            {stats?.students ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Students
          </p>
        </Card>
      </div>

      {/* ── Login URL Widget ── */}
      <Card variant="bordered" className="shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-primary-light flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-small font-bold text-text-primary mb-1">
              Staff &amp; Student Login URL
            </p>
            <p className="text-caption text-text-muted mb-3">
              Share this link with your teachers and students so they can log in to the system.
            </p>
            <div className="flex items-center gap-2 bg-bg border border-border rounded-sm px-3 py-2 flex-wrap">
              <span className="text-small font-mono text-text-secondary break-all">{loginUrl}</span>
              <CopyButton text={loginUrl} />
            </div>
          </div>
        </div>
      </Card>

      {/* ── School Info Quick View ── */}
      {school && (
        <Card variant="bordered" className="shadow-sm">
          <h2 className="text-h3 font-bold mb-3">School Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-small">
            {school.address && (
              <div>
                <span className="text-text-muted font-semibold">Address: </span>
                <span>{school.address}</span>
              </div>
            )}
            {school.phone && (
              <div>
                <span className="text-text-muted font-semibold">Phone: </span>
                <span>{school.phone}</span>
              </div>
            )}
            {school.email && (
              <div>
                <span className="text-text-muted font-semibold">Email: </span>
                <span>{school.email}</span>
              </div>
            )}
            {school.website && (
              <div>
                <span className="text-text-muted font-semibold">Website: </span>
                <a href={school.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{school.website}</a>
              </div>
            )}
          </div>
          {(!school.address && !school.phone && !school.email) && (
            <p className="text-small text-text-muted">
              No school info set yet. Go to <a href="/school-admin/profile" className="text-primary hover:underline">School Profile</a> to fill in your details.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
