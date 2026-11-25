"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { todayLocal } from "@/lib/finance/dates";
import {
  isAttendanceStatus,
  summarizeDaily,
  type AttendanceStatus,
} from "@/lib/attendance/daily";

type ClassOption = {
  id: string;
  name: string;
  role?: string | null;
  studentCount?: number;
};

type StudentRow = {
  id: string;
  name: string;
  admissionNo: string | null;
  status: string | null;
  remarks: string | null;
};

type Register = {
  class: { id: string; name: string };
  date: string;
  today: string;
  term: { id: string; name: string; start_date: string; end_date: string } | null;
  students: StudentRow[];
  markedCount: number;
};

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  selected: string;
}[] = [
  { value: "present", label: "Present", selected: "bg-success text-white border-success" },
  { value: "absent", label: "Absent", selected: "bg-error text-white border-error" },
  { value: "late", label: "Late", selected: "bg-warning text-white border-warning" },
  { value: "excused", label: "Excused", selected: "bg-info text-white border-info" },
];

export default function TeacherAttendancePage() {
  const [today] = useState(() => todayLocal());
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [register, setRegister] = useState<Register | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | "">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (cid: string, day: string) => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/teacher/attendance?class_id=${encodeURIComponent(cid)}&date=${encodeURIComponent(day)}`,
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load the register.");

      const data = body as Register;
      setRegister(data);
      const next: Record<string, AttendanceStatus | ""> = {};
      for (const student of data.students) {
        next[student.id] = isAttendanceStatus(student.status) ? student.status : "";
      }
      setStatuses(next);
    } catch (err) {
      setRegister(null);
      setError(err instanceof Error ? err.message : "Could not load the register.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/teacher/dashboard")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const formClasses: ClassOption[] = (Array.isArray(data?.classes) ? data.classes : []).filter(
          (cls: ClassOption) => cls.role,
        );
        setClasses(formClasses);
        if (formClasses.length > 0) {
          setClassId(formClasses[0].id);
          void load(formClasses[0].id, today);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [load, today]);

  function changeClass(nextClassId: string) {
    if (!nextClassId) return;
    setClassId(nextClassId);
    void load(nextClassId, date);
  }

  function changeDate(nextDate: string) {
    if (!nextDate || nextDate > today) return;
    setDate(nextDate);
    void load(classId, nextDate);
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setMessage(null);
    setStatuses((current) => ({ ...current, [studentId]: status }));
  }

  function markAllPresent() {
    if (!register) return;
    const next: Record<string, AttendanceStatus | ""> = {};
    for (const student of register.students) next[student.id] = "present";
    setStatuses(next);
    setMessage(null);
  }

  async function save() {
    if (!register || saving) return;

    const records = Object.entries(statuses)
      .filter(([, status]) => isAttendanceStatus(status))
      .map(([student_id, status]) => ({ student_id, status }));

    if (records.length === 0) {
      setMessage("Mark at least one student before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: register.class.id, date, records }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not save the register.");

      const skipped = Number(body.skipped) || 0;
      const updated = body.termTotalsUpdated === true;
      const locked = body.termLocked === true;
      setMessage(
        `Saved ${body.saved} student${body.saved === 1 ? "" : "s"}.` +
          (updated ? " Report-card attendance totals were updated." : "") +
          (locked
            ? " Report-card totals were not changed because results for this term are locked."
            : "") +
          (skipped > 0 ? ` ${skipped} row${skipped === 1 ? "" : "s"} skipped.` : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the register.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && classes.length === 0) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading attendance">
        <div className="h-16 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-lg" />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">Attendance</h1>
        <p className="text-small text-text-muted">
          You are not the class teacher of a class yet. Ask your school admin to
          assign you as a form teacher before taking a daily register.
        </p>
      </Card>
    );
  }

  const markedStatuses = Object.values(statuses).filter(isAttendanceStatus);
  const summary = summarizeDaily(markedStatuses.map((status) => ({ status })));
  const total = register?.students.length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">Attendance</h1>
        <p className="text-small text-text-muted mt-0.5">
          Take the daily register for the class you are form teacher of.
        </p>
      </div>

      <Card variant="default" padding="md">
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-caption font-medium text-text-primary block mb-1">Class</span>
            <select
              value={classId}
              onChange={(event) => changeClass(event.target.value)}
              className="w-full h-11 px-3 border border-border rounded-lg bg-surface text-small text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                  {typeof cls.studentCount === "number" ? ` (${cls.studentCount})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-caption font-medium text-text-primary block mb-1">Date</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => changeDate(event.target.value)}
              className="w-full h-11 px-3 border border-border rounded-lg bg-surface text-small text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        <p className="text-caption text-text-muted mt-3">
          {register?.term
            ? `${register.term.name} · saving also updates the term totals printed on report cards.`
            : "No active term — the register is saved, but report-card totals will not be updated."}
        </p>
      </Card>

      {error && (
        <div className="bg-error-bg border border-error rounded-lg px-4 py-3">
          <p className="text-small text-error font-medium">{error}</p>
        </div>
      )}
      {message && (
        <div className="bg-success-bg border border-success rounded-lg px-4 py-3">
          <p className="text-small text-success font-medium">{message}</p>
        </div>
      )}

      <Card variant="default" padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-caption">
            <span className="px-2 py-1 rounded-full bg-success-bg text-success font-semibold">
              {summary.present} present
            </span>
            <span className="px-2 py-1 rounded-full bg-error-bg text-error font-semibold">
              {summary.absent} absent
            </span>
            <span className="px-2 py-1 rounded-full bg-warning-bg text-warning font-semibold">
              {summary.late} late
            </span>
            <span className="px-2 py-1 rounded-full bg-info-bg text-info font-semibold">
              {summary.excused} excused
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={markAllPresent} disabled={loading || total === 0}>
            Mark all present
          </Button>
        </div>
        <p className="text-caption text-text-muted mt-2">
          {summary.marked} of {total} students marked
          {summary.rate !== null ? ` · ${summary.rate}% attended` : ""}
        </p>
      </Card>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading students">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-24 skeleton rounded-lg" />
          ))}
        </div>
      ) : !register || register.students.length === 0 ? (
        <Card variant="default" className="text-center py-8">
          <p className="text-small text-text-muted">No active students in this class.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {register.students.map((student) => {
            const current = statuses[student.id];
            return (
              <div key={student.id} className="bg-surface border border-border rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-small font-semibold text-text-primary truncate">
                    {student.name}
                  </p>
                  {student.admissionNo && (
                    <p className="text-caption text-text-muted shrink-0">{student.admissionNo}</p>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {STATUS_OPTIONS.map((option) => {
                    const selected = current === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setStatus(student.id, option.value)}
                        className={`min-h-[44px] rounded-md border text-caption font-semibold transition-colors ${
                          selected
                            ? option.selected
                            : "bg-surface text-text-secondary border-border hover:bg-bg"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 tablet:-mx-8 px-4 tablet:px-8 py-3 bg-bg border-t border-border">
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-text-muted">
            {summary.marked} marked{summary.marked < total ? ` · ${total - summary.marked} unmarked` : ""}
          </p>
          <Button onClick={save} loading={saving} disabled={summary.marked === 0 || loading}>
            Save attendance
          </Button>
        </div>
      </div>
    </div>
  );
}
