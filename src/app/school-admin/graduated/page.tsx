"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, toast } from "@/components/ui";

type GraduatedStudent = {
  id: string;
  admission_no: string | null;
  name: string;
  graduation_year: number | null;
  graduation_class_name: string;
  graduated_at: string | null;
  status: string;
  email: string | null;
};

type GraduatedGroup = {
  class_name: string;
  count: number;
  students: GraduatedStudent[];
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GraduatedStudentsPage() {
  const [groups, setGroups] = useState<GraduatedGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: "100" });
    if (query) params.set("search", query);

    fetch(`/api/school-admin/graduated?${params}`)
      .then((r) =>
        r
          .json()
          .then((data) => ({ ok: r.ok, data }))
          .catch(() => ({ ok: r.ok, data: {} as Record<string, unknown> })),
      )
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data?.error as string) || "Could not load graduated students.");
        setGroups(Array.isArray(data.groups) ? (data.groups as GraduatedGroup[]) : []);
        setTotal(Number(data.total ?? 0));
        setTotalPages(Number(data.totalPages ?? 1));
      })
      .catch((err) => {
        toast.error(
          "Could not load graduated students",
          err instanceof Error ? err.message : "Please try again.",
        );
        setGroups([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-bold">Graduated Students</h1>
          <p className="text-small text-text-muted mt-1">
            Former students who completed a graduating class. Grouped by the class they graduated
            from; their historical records remain available.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/school-admin/students"
            className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-small font-semibold hover:bg-bg"
          >
            Students
          </a>
          <a
            href="/school-admin/promotion"
            className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-small font-semibold hover:bg-bg"
          >
            Promote Students
          </a>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-55">
            <Input
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or admission number"
              fullWidth
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Badge variant="info">{total} graduated</Badge>
        </form>
      </Card>

      {loading ? (
        <p className="text-small text-text-muted">Loading graduated students…</p>
      ) : groups.length === 0 ? (
        <Card>
          <p className="text-small text-text-muted">
            {query
              ? "No graduated students match that search."
              : "No students have graduated yet. Graduating classes are configured under Promote Students."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card
              key={group.class_name}
              header={
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-h3 font-bold">{group.class_name}</h2>
                  <Badge variant="success">{group.count} graduated</Badge>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-muted">
                      <th className="py-2 pr-4 font-semibold">Student</th>
                      <th className="py-2 pr-4 font-semibold">Admission No.</th>
                      <th className="py-2 pr-4 font-semibold">Graduation year</th>
                      <th className="py-2 pr-4 font-semibold">Graduated on</th>
                      <th className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.students.map((student) => (
                      <tr
                        key={student.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-text-primary">{student.name}</p>
                          {student.email ? (
                            <p className="text-caption text-text-muted break-all">
                              {student.email}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">
                          {student.admission_no || "—"}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">
                          {student.graduation_year ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">
                          {formatDate(student.graduated_at)}
                        </td>
                        <td className="py-3">
                          <Badge variant="success">Graduated</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-caption text-text-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
