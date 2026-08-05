"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export default function StudentDashboard() {
  const router = useRouter();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-h1 font-bold">Dashboard</h1>
        <p className="text-small text-text-muted mt-1">Welcome to your student portal</p>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
        <button
          onClick={() => router.push("/student/results")}
          className="text-left p-8 bg-surface border border-border rounded-lg hover:border-primary hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-h3 font-bold text-text-primary">Check Results</h2>
          <p className="text-small text-text-muted mt-1">View and download your report cards</p>
        </button>

        <button
          onClick={() => router.push("/student/profile")}
          className="text-left p-8 bg-surface border border-border rounded-lg hover:border-primary hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-h3 font-bold text-text-primary">My Profile</h2>
          <p className="text-small text-text-muted mt-1">Update your photo and personal details</p>
        </button>
      </div>

      <Card variant="default" className="shadow-sm">
        <div className="p-5">
          <h2 className="text-small font-bold text-text-muted uppercase tracking-wider mb-3">About This Portal</h2>
          <ul className="space-y-2 text-small text-text-secondary">
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>View your report cards anytime</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>Download PDF copies for your records</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-success mt-0.5">✓</span>
              <span>Update your profile photo and information</span>
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
