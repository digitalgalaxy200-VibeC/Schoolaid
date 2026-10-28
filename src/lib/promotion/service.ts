import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPreview, planRunItems, validateMappings } from "./plan";
import type {
  GraduatedStudent,
  MappingInput,
  PromotionClass,
  PromotionPreview,
  PromotionRunStatus,
  PromotionRunSummary,
  RunItem,
  SavedMapping,
  StudentForPreview,
} from "./types";

// ---------------------------------------------------------------------------
// Small normalisers — PostgREST returns an embedded relation as an object or an
// array depending on the FK shape, exactly like the rest of this codebase.
// ---------------------------------------------------------------------------
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

type ClassRow = { id: string; name: string };

type StudentRow = {
  id: string;
  student_id: string | null;
  class_id: string | null;
  status: string | null;
  is_active: boolean | null;
  profile_id?: string | null;
  graduation_year?: number | null;
  graduation_class_id?: string | null;
  graduation_class_name?: string | null;
  graduated_at?: string | null;
  profiles:
    | { full_name: string | null; email: string | null; is_active: boolean | null }
    | { full_name: string | null; email: string | null; is_active: boolean | null }[]
    | null;
  classes?: { name: string | null } | { name: string | null }[] | null;
};

type RunItemRow = {
  student_id: string;
  from_class_id: string | null;
  to_class_id: string | null;
  action: "promote" | "graduate";
  status: "pending" | "done" | "failed" | "skipped";
  error: string | null;
};

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadClassesRaw(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from("classes")
    .select("id, name")
    .eq("school_id", schoolId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ClassRow[]).sort(byName);
}

export async function loadMappings(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<SavedMapping[]> {
  const { data, error } = await supabase
    .from("promotion_mappings")
    .select("id, source_class_id, destination_class_id, action")
    .eq("school_id", schoolId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SavedMapping[];
}

export async function loadStudents(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<StudentForPreview[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, class_id, status, is_active, profiles(full_name, email, is_active)")
    .eq("school_id", schoolId);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as StudentRow[]).map((row) => {
    const profile = one(row.profiles);
    return {
      id: row.id,
      admission_no: row.student_id ?? null,
      name: profile?.full_name || "Unnamed Student",
      class_id: row.class_id ?? null,
      status: row.status || "active",
      is_active: profile?.is_active ?? row.is_active ?? true,
    };
  });
}

function withCounts(classes: ClassRow[], students: StudentForPreview[]): PromotionClass[] {
  const counts = new Map<string, number>();
  for (const student of students) {
    if (!student.class_id) continue;
    counts.set(student.class_id, (counts.get(student.class_id) ?? 0) + 1);
  }
  return classes
    .map((c) => ({ id: c.id, name: c.name, student_count: counts.get(c.id) ?? 0 }))
    .sort(byName);
}

export interface PromotionState {
  classes: PromotionClass[];
  mappings: SavedMapping[];
  students: StudentForPreview[];
}

export async function loadPromotionState(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<PromotionState> {
  const [classes, mappings, students] = await Promise.all([
    loadClassesRaw(supabase, schoolId),
    loadMappings(supabase, schoolId),
    loadStudents(supabase, schoolId),
  ]);
  return { classes: withCounts(classes, students), mappings, students };
}

export async function loadPreview(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<PromotionPreview> {
  const { classes, mappings, students } = await loadPromotionState(supabase, schoolId);
  return buildPreview({ classes, mappings, students });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export async function saveMappings(
  supabase: SupabaseClient,
  schoolId: string,
  mappings: MappingInput[],
): Promise<void> {
  // Replace the school's configuration wholesale. The admin always re-submits
  // the complete set from the UI, so a stale mapping cannot linger.
  const { error: deleteError } = await supabase
    .from("promotion_mappings")
    .delete()
    .eq("school_id", schoolId);
  if (deleteError) throw new Error(deleteError.message);

  if (mappings.length === 0) return;

  const rows = mappings.map((m) => ({
    school_id: schoolId,
    source_class_id: m.source_class_id,
    destination_class_id: m.action === "graduate" ? null : m.destination_class_id ?? null,
    action: m.action,
  }));

  const { error } = await supabase.from("promotion_mappings").insert(rows);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** How long a "running" run is considered live before a retry may resume it. */
const RUN_STALE_MS = 10 * 60 * 1000;

function idempotencyKey(
  schoolId: string,
  targetTermId: string | null,
  mappings: Pick<SavedMapping, "source_class_id" | "destination_class_id" | "action">[],
): string {
  const signature = [...mappings]
    .sort((a, b) => a.source_class_id.localeCompare(b.source_class_id))
    .map((m) => `${m.source_class_id}>${m.action}:${m.destination_class_id ?? "graduated"}`)
    .join(",");
  return `v1:${schoolId}:${targetTermId ?? "no-term"}:${signature}`;
}

async function resolveGraduationYear(
  supabase: SupabaseClient,
  schoolId: string,
  targetTermId: string | null,
): Promise<number> {
  if (targetTermId) {
    const { data: term } = await supabase
      .from("academic_terms")
      .select("session_id")
      .eq("id", targetTermId)
      .eq("school_id", schoolId)
      .maybeSingle();
    const sessionId = (term as { session_id?: string | null } | null)?.session_id;
    if (sessionId) {
      const { data: session } = await supabase
        .from("academic_sessions")
        .select("start_date")
        .eq("id", sessionId)
        .eq("school_id", schoolId)
        .maybeSingle();
      const startDate = (session as { start_date?: string | null } | null)?.start_date;
      if (startDate) return new Date(startDate).getFullYear();
    }
  }
  return new Date().getFullYear();
}

async function findRunByKey(
  supabase: SupabaseClient,
  schoolId: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("promotion_runs")
    .select("*")
    .eq("school_id", schoolId)
    .eq("idempotency_key", key)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

function summaryFromRow(row: Record<string, unknown>): PromotionRunSummary {
  const summary = row.summary as Partial<PromotionRunSummary> | null;
  if (summary && typeof summary === "object" && "run_id" in summary) {
    return summary as PromotionRunSummary;
  }
  return {
    run_id: String(row.id ?? ""),
    status: (row.status as PromotionRunStatus) ?? "completed",
    target_term_id: (row.target_term_id as string | null) ?? null,
    total: Number(row.total_students ?? 0),
    promoted: Number(row.promoted_count ?? 0),
    graduated: Number(row.graduated_count ?? 0),
    skipped: Number(row.skipped_count ?? 0),
    failed: Number(row.failed_count ?? 0),
    errors: [],
    groups: [],
  };
}

/** Build the final counts/groups from the run's own frozen items. */
function buildRunSummary(
  runId: string,
  targetTermId: string | null,
  rows: RunItemRow[],
  classById: Map<string, PromotionClass>,
): PromotionRunSummary {
  let promoted = 0;
  let graduated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: PromotionRunSummary["errors"] = [];
  const groups = new Map<string, PromotionRunSummary["groups"][number]>();

  const className = (id: string | null) =>
    (id ? classById.get(id)?.name : null) ?? "Unknown class";

  for (const row of rows) {
    if (row.status === "done") {
      if (row.action === "graduate") graduated += 1;
      else promoted += 1;
    } else if (row.status === "skipped") {
      skipped += 1;
    } else if (row.status === "failed") {
      failed += 1;
      errors.push({ student_id: row.student_id, reason: row.error || "Unknown error" });
    }

    const key = `${row.from_class_id ?? "null"}|${row.to_class_id ?? "null"}|${row.action}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        source_class_name: className(row.from_class_id),
        destination:
          row.action === "graduate"
            ? "Graduated"
            : className(row.to_class_id),
        action: row.action,
        count: 1,
      });
    }
  }

  const status: PromotionRunStatus =
    failed === 0 ? "completed" : promoted + graduated > 0 ? "partial" : "failed";

  return {
    run_id: runId,
    status,
    target_term_id: targetTermId,
    total: rows.length,
    promoted,
    graduated,
    skipped,
    failed,
    errors,
    groups: Array.from(groups.values()),
  };
}

export interface ExecutePromotionArgs {
  schoolId: string;
  userId: string | null;
  targetTermId: string | null;
}

/**
 * Execute the saved mappings against the school's current students.
 *
 * Safe-retry model:
 *   • A completed run with the same (school, term, mappings) key is returned
 *     as-is — it is never executed a second time.
 *   • A live "running" run with the same key blocks a second execution.
 *   • A stale running / partial / failed run RESUMES ITS OWN FROZEN PLAN: the
 *     pending items already record each student's source and destination, so a
 *     retry can never cascade a student through two mappings.
 *   • Every item only applies while the student is STILL in `from_class_id` and
 *     still eligible, so even a resumed run cannot promote anyone twice.
 */
export async function executePromotion(
  supabase: SupabaseClient,
  args: ExecutePromotionArgs,
): Promise<PromotionRunSummary> {
  const { schoolId, userId, targetTermId } = args;

  const [classRows, mappings, students] = await Promise.all([
    loadClassesRaw(supabase, schoolId),
    loadMappings(supabase, schoolId),
    loadStudents(supabase, schoolId),
  ]);

  const classes = withCounts(classRows, students);
  const classById = new Map(classes.map((c) => [c.id, c]));

  if (mappings.length === 0) {
    throw new Error("No promotion mappings are configured.");
  }

  const configErrors = validateMappings(mappings, classes);
  if (configErrors.length > 0) throw new Error(configErrors.join(" "));

  const baseKey = idempotencyKey(schoolId, targetTermId, mappings);
  const existing = await findRunByKey(supabase, schoolId, baseKey);

  let runId: string;
  let items: RunItem[];

  if (existing) {
    const status = existing.status as PromotionRunStatus;
    if (status === "completed") {
      return summaryFromRow(existing);
    }

    const createdAt = new Date(String(existing.created_at ?? "")).getTime();
    const isLive =
      status === "running" && Number.isFinite(createdAt) && Date.now() - createdAt < RUN_STALE_MS;
    if (isLive) {
      throw new Error("A promotion with this configuration is already running.");
    }

    // Resume the existing frozen plan rather than recomputing it.
    runId = String(existing.id);
    const { data: dbItems, error: itemsError } = await supabase
      .from("promotion_run_items")
      .select("student_id, from_class_id, to_class_id, action, status")
      .eq("run_id", runId);
    if (itemsError) throw new Error(itemsError.message);

    items = ((dbItems ?? []) as unknown as RunItemRow[])
      .filter((item) => item.status === "pending" || item.status === "failed")
      .map((item) => ({
        student_id: item.student_id,
        from_class_id: item.from_class_id,
        to_class_id: item.to_class_id,
        action: item.action,
      }));

    await supabase
      .from("promotion_runs")
      .update({ status: "running" })
      .eq("id", runId)
      .eq("school_id", schoolId);
  } else {
    const preview = buildPreview({ classes, mappings, students });
    const planned = planRunItems(preview);

    if (planned.length === 0) {
      return {
        run_id: "",
        status: "completed",
        target_term_id: targetTermId,
        total: 0,
        promoted: 0,
        graduated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        groups: [],
      };
    }

    const { data: runRow, error: runError } = await supabase
      .from("promotion_runs")
      .insert({
        school_id: schoolId,
        target_term_id: targetTermId,
        status: "running",
        idempotency_key: baseKey,
        total_students: planned.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (runError || !runRow) {
      throw new Error(runError?.message || "Could not create the promotion run.");
    }
    runId = String((runRow as { id: string }).id);

    const { error: insertError } = await supabase.from("promotion_run_items").insert(
      planned.map((item) => ({
        run_id: runId,
        student_id: item.student_id,
        from_class_id: item.from_class_id,
        to_class_id: item.to_class_id,
        action: item.action,
        status: "pending",
      })),
    );
    if (insertError) {
      await supabase
        .from("promotion_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("school_id", schoolId);
      throw new Error(insertError.message);
    }

    items = planned;
  }

  const graduationYear = await resolveGraduationYear(supabase, schoolId, targetTermId);

  for (const item of items) {
    const result = await applyItem(supabase, {
      schoolId,
      targetTermId,
      graduationYear,
      classById,
      item,
    });

    await supabase
      .from("promotion_run_items")
      .update({ status: result.status, error: result.error ?? null })
      .eq("run_id", runId)
      .eq("student_id", item.student_id);
  }

  // Counts come from the run's own rows, so a resumed run includes everything
  // that was already completed before the interruption.
  const { data: finalItems, error: finalError } = await supabase
    .from("promotion_run_items")
    .select("student_id, from_class_id, to_class_id, action, status, error")
    .eq("run_id", runId);
  if (finalError) throw new Error(finalError.message);

  const summary = buildRunSummary(
    runId,
    targetTermId,
    (finalItems ?? []) as unknown as RunItemRow[],
    classById,
  );

  await supabase
    .from("promotion_runs")
    .update({
      status: summary.status,
      promoted_count: summary.promoted,
      graduated_count: summary.graduated,
      skipped_count: summary.skipped,
      failed_count: summary.failed,
      total_students: summary.total,
      summary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("school_id", schoolId);

  // Best effort: audit_logs has no details column, so the structured outcome
  // lives in promotion_runs.summary. Never let the audit write fail the run.
  if (userId) {
    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      school_id: schoolId,
      event: "student_promotion",
    });
    if (auditError) {
      console.error("[promotion] audit write failed:", auditError.message);
    }
  }

  return summary;
}

type ItemResult = { status: "done" | "skipped" | "failed"; error?: string };

async function applyItem(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    targetTermId: string | null;
    graduationYear: number;
    classById: Map<string, PromotionClass>;
    item: RunItem;
  },
): Promise<ItemResult> {
  const { schoolId, targetTermId, graduationYear, classById, item } = args;

  const { data: rawStudent, error: studentError } = await supabase
    .from("students")
    .select("id, school_id, profile_id, class_id, status, profiles(is_active)")
    .eq("id", item.student_id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (studentError) return { status: "failed", error: studentError.message };
  const student = rawStudent as
    | {
        id: string;
        school_id: string;
        profile_id: string | null;
        class_id: string | null;
        status: string | null;
        profiles: { is_active: boolean | null } | { is_active: boolean | null }[] | null;
      }
    | null;
  if (!student) return { status: "failed", error: "Student not found in this school" };

  // Eligibility is re-checked at write time: a student archived, withdrawn or
  // otherwise changed after the preview must not be moved.
  const profile = one(student.profiles);
  if (student.status !== "active" || profile?.is_active === false) {
    return {
      status: "skipped",
      error: `Student is no longer eligible (${student.status ?? "unknown status"})`,
    };
  }

  // The frozen plan only applies while the student is still in the source class.
  if ((student.class_id ?? null) !== (item.from_class_id ?? null)) {
    return { status: "skipped", error: "Student is no longer in the source class" };
  }

  if (item.action === "promote") {
    if (!item.to_class_id || !classById.has(item.to_class_id)) {
      return { status: "failed", error: "Destination class is not valid for this school" };
    }

    const { data: updated, error } = await supabase
      .from("students")
      .update({ class_id: item.to_class_id, updated_at: new Date().toISOString() })
      .eq("id", item.student_id)
      .eq("school_id", schoolId)
      .eq("class_id", item.from_class_id)
      .select("id");
    if (error) return { status: "failed", error: error.message };
    if (!updated || updated.length === 0) {
      return { status: "skipped", error: "Student had already moved" };
    }

    // Record the class for the target term. Historical rows are never rewritten.
    if (targetTermId) {
      const { error: enrolError } = await supabase.from("enrollments").upsert(
        {
          school_id: schoolId,
          student_id: item.student_id,
          class_id: item.to_class_id,
          academic_term_id: targetTermId,
          status: "active",
        },
        { onConflict: "student_id,class_id,academic_term_id" },
      );
      if (enrolError) {
        console.error("[promotion] enrollment write failed:", enrolError.message);
      }
    }

    return { status: "done" };
  }

  // Graduate
  const className = classById.get(item.from_class_id ?? "")?.name ?? "Unknown class";
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("students")
    .update({
      // Graduation moves the student out of active enrolment: the class is
      // cleared so no class-based roster, dropdown or future promotion preview
      // can pick them up. The graduating class is preserved in the snapshot
      // columns below (and in promotion_run_items).
      class_id: null,
      status: "graduated",
      graduation_year: graduationYear,
      graduation_class_id: item.from_class_id,
      graduation_class_name: className,
      graduated_at: now,
      updated_at: now,
    })
    .eq("id", item.student_id)
    .eq("school_id", schoolId)
    .eq("class_id", item.from_class_id)
    .select("id");
  if (error) return { status: "failed", error: error.message };
  if (!updated || updated.length === 0) {
    return { status: "skipped", error: "Student had already moved" };
  }

  // Canonical archive flag; the 078 trigger mirrors it into students.is_active.
  if (student.profile_id) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", student.profile_id)
      .eq("school_id", schoolId);
    if (profileError) {
      console.error("[promotion] profile deactivation failed:", profileError.message);
    }
  }

  return { status: "done" };
}

// ---------------------------------------------------------------------------
// Graduated list & run history
// ---------------------------------------------------------------------------

export async function loadGraduated(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<GraduatedStudent[]> {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, student_id, class_id, status, graduation_year, graduation_class_id, graduation_class_name, graduated_at, profiles(full_name, email, is_active), classes(name)",
    )
    .eq("school_id", schoolId)
    .eq("status", "graduated")
    .order("graduated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as StudentRow[]).map((row) => {
    const profile = one(row.profiles);
    const cls = one(row.classes ?? null);
    return {
      id: row.id,
      admission_no: row.student_id ?? null,
      name: profile?.full_name || "Unnamed Student",
      graduation_year: row.graduation_year ?? null,
      graduation_class_name:
        row.graduation_class_name || cls?.name || "Unknown class",
      graduated_at: row.graduated_at ?? null,
      status: row.status || "graduated",
      email: profile?.email ?? null,
    };
  });
}

export async function loadRunHistory(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("promotion_runs")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}
