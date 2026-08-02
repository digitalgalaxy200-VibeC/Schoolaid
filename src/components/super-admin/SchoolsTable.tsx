"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button"; // Assuming this exists based on existing UI
import { MoreHorizontal, Search } from "lucide-react";

export type SchoolData = {
  id: string;
  name: string;
  logoUrl?: string;
  location: string;
  plan: "Free" | "Starter" | "Pro" | "Enterprise";
  usersCount: number;
  lastActive: string;
  status: "Active" | "Dormant" | "Suspended";
};

interface SchoolsTableProps {
  initialSchools: SchoolData[];
}

export function SchoolsTable({ initialSchools }: SchoolsTableProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredSchools = initialSchools.filter((school) => {
    const matchesSearch = school.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlan = planFilter === "All" || school.plan === planFilter;
    const matchesStatus = statusFilter === "All" || school.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search schools..."
            className="w-full h-12 pl-10 pr-4 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-3 w-full sm:w-auto">
          <select
            className="h-12 px-4 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:border-primary"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="All">All Plans</option>
            <option value="Free">Free</option>
            <option value="Starter">Starter</option>
            <option value="Pro">Pro</option>
            <option value="Enterprise">Enterprise</option>
          </select>

          <select
            className="h-12 px-4 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:border-primary"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Dormant">Dormant</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg text-xs uppercase tracking-wide text-text-muted border-b border-border">
                <th className="px-6 py-4 font-medium">School Name</th>
                <th className="px-6 py-4 font-medium">Location</th>
                <th className="px-6 py-4 font-medium">Plan</th>
                <th className="px-6 py-4 font-medium">Users</th>
                <th className="px-6 py-4 font-medium">Last Active</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSchools.length > 0 ? (
                filteredSchools.map((school) => (
                  <tr
                    key={school.id}
                    className="hover:bg-bg transition-colors cursor-pointer group"
                    onClick={() => router.push(`/super-admin/schools/${school.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-border flex items-center justify-center overflow-hidden shrink-0">
                          {school.logoUrl ? (
                            <img src={school.logoUrl} alt={school.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-text-muted font-medium text-sm">
                              {school.name.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                          {school.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{school.location}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                        ${school.plan === 'Enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                          school.plan === 'Pro' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          school.plan === 'Starter' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }
                      `}>
                        {school.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{school.usersCount}</td>
                    <td className="px-6 py-4 text-sm text-text-secondary">{school.lastActive}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${school.status === 'Active' ? 'bg-success/10 text-success' : 
                          school.status === 'Dormant' ? 'bg-warning/10 text-warning' :
                          'bg-error/10 text-error'
                        }
                      `}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5
                          ${school.status === 'Active' ? 'bg-success' : 
                            school.status === 'Dormant' ? 'bg-warning' :
                            'bg-error'
                          }
                        `}></span>
                        {school.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/super-admin/schools/${school.id}`)}>
                          View
                        </Button>
                        {/* The spec requires Suspend/Delete with confirmation modal. We will stub these actions for now. */}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                      <div className="text-4xl mb-4">🏫</div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">No schools onboarded yet</h3>
                      <p className="text-text-secondary text-sm mb-6">
                        Schools will appear here once they complete registration.
                      </p>
                      <Button variant="default">
                        + Add School Manually
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
