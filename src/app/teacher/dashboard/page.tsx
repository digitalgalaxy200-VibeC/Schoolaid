"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";

type AssignedClass = {
  class_id: string;
  class_name: string;
  can_publish: boolean;
  subject_count: number;
};

export default function TeacherDashboard() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState("");
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [activeTerm, setActiveTerm] = useState("No active term");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      const schoolId = user.app_metadata?.school_id as string;
      const teacherId = user.app_metadata?.teacher_id as string;

      // Teacher profile
      const { data: teacher } = await supabase
        .from("teachers")
        .select("first_name, last_name")
        .eq("id", teacherId)
        .single();
      if (teacher) setTeacherName(`${teacher.first_name} ${teacher.last_name}`);

      // Active term
      const { data: term } = await supabase
        .from("terms")
        .select("term_name")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .single();
      if (term) setActiveTerm(term.term_name);

      // Assigned classes
      const { data: assignments } = await supabase
        .from("teacher_class_assignments")
        .select(`class_id, can_publish, classes(class_name)`)
        .eq("teacher_id", teacherId)
        .eq("school_id", schoolId);

      if (assignments) {
        const classesWithCounts = await Promise.all(
          assignments.map(async (a: any) => {
            const { count } = await supabase
              .from("teacher_subject_assignments")
              .select("id", { count: "exact", head: true })
              .eq("teacher_id", teacherId)
              .eq("class_id", a.class_id)
              .eq("school_id", schoolId);
            return {
              class_id: a.class_id,
              class_name: a.classes?.class_name ?? "Unknown Class",
              can_publish: a.can_publish,
              subject_count: count ?? 0,
            };
          }),
        );
        setAssignedClasses(classesWithCounts);
      }

      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 font-bold">
            Welcome, {teacherName || "Teacher"}
          </h1>
          <p className="text-small text-text-muted mt-1">
            Your classes and subjects for this term
          </p>
        </div>
        <Badge variant="success">{activeTerm}</Badge>
      </div>

      {/* Assigned Classes */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
        {assignedClasses.map((cls) => (
          <Card
            key={cls.class_id}
            variant="bordered"
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-h3 font-bold">{cls.class_name}</h3>
              {cls.can_publish && <Badge variant="success">Can Publish</Badge>}
            </div>
            <p className="text-small text-text-muted mb-4">
              {cls.subject_count} subject{cls.subject_count !== 1 ? "s" : ""}{" "}
              assigned
            </p>
            <button
              onClick={() => router.push(`/teacher/classes/${cls.class_id}`)}
              className="w-full py-2 bg-primary text-white rounded-sm text-small font-semibold hover:bg-primary-dark transition-colors"
            >
              Enter Scores →
            </button>
          </Card>
        ))}

        {assignedClasses.length === 0 && (
          <Card variant="bordered" className="col-span-2 text-center py-10">
            <p className="text-text-muted">No classes assigned yet.</p>
            <p className="text-caption text-text-muted mt-1">
              Contact your School Admin to get assigned.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
