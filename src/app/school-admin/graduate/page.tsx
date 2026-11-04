"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, toast } from "@/components/ui";

type ClassOption = { id: string; name: string };

type StudentRow = {
  id: string;
  student_id?: string | null;
  class_id?: string | null;
  profiles?: { full_name?: string | null } | null;
  classes?: { name?: string | null } | null;
};

type StudentsResponse = {
  data?: StudentRow[];
  total?: number;
  totalPages?: number;
  error?: string;
};

type GraduationSummary = {
  status: "running" | "completed" | "partial" | "failed";
  total: number;
  graduated: number;
  skipped: number;
  failed: number;
  errors: { student_id: string; reason: string }[];
};

function studentName(student: StudentRow): string {
  return student.profiles?.full_name || student.student_id || "Unnamed Student";
}

export default function GraduateStudentsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<GraduationSummary | null>(null);

  useEffect(() => {
    fetch("/api/school-admin/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setClasses(Array.isArray(d) ? (d as ClassOption[]) : []))
      .catch(() => {});
  }, []);

  const loadStudents = useCallback(() => {
    const params = new URLSearchParams({
      status: "active",
      page: String(page),
      limit: "100",
    });
    if (classId) params.set("class_id", classId);

    fetch(`/api/school-admin/students?${params}`)
      .then((r) =>
        r
          .json()
          .then((data) => ({ ok: r.ok, data }))
          .catch(() => ({ ok: r.ok, data: {} as StudentsResponse })),
      )
      .then(({ ok, data }) => {
        const payload = data as StudentsResponse;
        if (!ok) throw new Error(payload.error || "Could not load students.");
        const rows = Array.isArray(payload.data) ? payload.data : [];
        setStudents(rows);
        setTotal(Number(payload.total ?? rows.length));
        setTotalPages(Number(payload.totalPages ?? 1));
      })
      .catch((err) => {
        toast.error(
          "Could not load students",
          err instanceof Error ? err.message : "Please try again.",
        );
        setStudents([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [classId, page]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const allOnPageSelected = useMemo(
    () => students.length > 0 && students.every((student) => selected.has(student.id)),
    [students, selected],
  );

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const student of students) next.delete(student.id);
      } else {
        for (const student of students) next.add(student.id);
      }
      return next;
    });
  };

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const res = await fetch("/api/school-admin/students/graduate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_ids: Array.from(selected),
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Graduation failed.");
      }
      setSummary(data as GraduationSummary);
      setSelected(new Set());
      setConfirmOpen(false);
      loadStudents();
      toast.success("Graduation complete", "Graduated records are preserved.");
    } catch (err) {
      toast.error(
        "Graduation failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-bold">Graduate Students</h1>
          <p className="text-small text-text-muted mt-1">
            Graduate one student or a whole group. Their records are preserved and they are removed
            from active classes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/school-admin/graduated"
            className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-small font-semibold hover:bg-bg"
          >
            Graduated Students
          </a>
          <a
            href="/school-admin/students"
            className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-small font-semibold hover:bg-bg"
          >
            Students
          </a>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-caption text-text-muted">
            <span className="block mb-1 font-semibold">Filter by class</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPage(1);
                setSelected(new Set());
              }}
              className="px-3 h-10 min-w-55 bg-surface border border-border rounded-lg text-small focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">All classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <Badge variant={selected.size > 0 ? "info" : "default"}>
              {selected.size} selected
            </Badge>
            <Button variant="secondary" size="sm" onClick={toggleAllOnPage} disabled={students.length === 0}>
              {allOnPageSelected ? "Clear page" : "Select page"}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 font-bold">Active students</h2>
            <span className="text-caption text-text-muted">
              {total} student{total === 1 ? "" : "s"}
            </span>
          </div>
        }
      >
        {loading ? (
          <p className="text-small text-text-muted">Loading students…</p>
        ) : students.length === 0 ? (
          <p className="text-small text-text-muted">
            No active students found{classId ? " in this class" : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-muted">
                  <th className="w-10 py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all students on this page"
                    />
                  </th>
                  <th className="py-2 pr-4 font-semibold">Student</th>
                  <th className="py-2 pr-4 font-semibold">Admission No.</th>
                  <th className="py-2 font-semibold">Class</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        aria-label={`Select ${studentName(student)}`}
                      />
                    </td>
                    <td className="py-3 pr-4 font-semibold text-text-primary">
                      {studentName(student)}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {student.student_id || "—"}
                    </td>
                    <td className="py-3 text-text-secondary">
                      {student.classes?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
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

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || executing}
            loading={executing}
            variant="warning"
          >
            Graduate {selected.size > 0 ? `${selected.size} ` : ""}student
            {selected.size === 1 ? "" : "s"}
          </Button>
          <span className="text-caption text-text-muted">
            A confirmation step follows. Records are never deleted.
          </span>
        </div>
      </Card>

      {summary ? (
        <Card header={<h2 className="text-h3 font-bold">Graduation summary</h2>}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  summary.status === "completed"
                    ? "success"
                    : summary.status === "partial"
                      ? "warning"
                      : "error"
                }
              >
                {summary.status}
              </Badge>
              <Badge variant="success">Graduated: {summary.graduated}</Badge>
              <Badge variant="default">Skipped: {summary.skipped}</Badge>
              <Badge variant={summary.failed > 0 ? "error" : "default"}>
                Failed: {summary.failed}
              </Badge>
            </div>

            {summary.errors.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-body font-bold text-error">Records requiring attention</h3>
                {summary.errors.map((item) => (
                  <div
                    key={item.student_id}
                    className="rounded-md border border-error bg-error-bg px-3 py-2 text-small text-error"
                  >
                    {item.student_id}: {item.reason}
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-caption text-text-muted">
              Historical report cards, attendance and finance records were not modified.
            </p>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Graduate students"
        message={`Graduate ${selected.size} selected student${
          selected.size === 1 ? "" : "s"
        }? They will leave the active class list and their records will be preserved.`}
        confirmLabel="Graduate"
        variant="warning"
        loading={executing}
        onConfirm={handleExecute}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
