import type {
  MappingInput,
  PreviewGroup,
  PreviewStudent,
  PromotionClass,
  PromotionPreview,
  RunItem,
  SavedMapping,
  StudentForPreview,
  FlaggedStudent,
} from "./types";

/** Natural-order comparison for DISPLAY ONLY. It is never used to infer a destination. */
function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function toPreviewStudent(student: StudentForPreview): PreviewStudent {
  return {
    id: student.id,
    name: student.name,
    admission_no: student.admission_no,
  };
}

/** Why an otherwise-present student cannot be processed automatically. */
function ineligibilityReason(student: StudentForPreview): string | null {
  if (student.status === "graduated") return "Already graduated";
  if (student.status === "alumni") return "Already an alumnus";
  if (student.status === "withdrawn") return "Withdrawn";
  if (student.status === "suspended") return "Suspended";
  if (student.status === "pending") return "Pending enrolment";
  if (!student.is_active) return "Archived";
  if (student.status !== "active") return `Status: ${student.status}`;
  return null;
}

/**
 * Validate the administrator's mappings against the school's own classes.
 * Pure: no database access, no inference. Returns human-readable errors.
 */
export function validateMappings(
  mappings: MappingInput[],
  classes: Pick<PromotionClass, "id" | "name">[],
): string[] {
  const errors: string[] = [];
  const classById = new Map(classes.map((c) => [c.id, c]));
  const seenSources = new Set<string>();

  if (mappings.length === 0) {
    return ["No mappings configured. Choose a destination or Graduated for at least one class."];
  }

  for (const mapping of mappings) {
    const source = classById.get(mapping.source_class_id);
    if (!source) {
      errors.push("A source class does not belong to this school.");
      continue;
    }

    if (seenSources.has(mapping.source_class_id)) {
      errors.push(`“${source.name}” has more than one destination. Each class can be mapped once.`);
      continue;
    }
    seenSources.add(mapping.source_class_id);

    if (mapping.action === "graduate") {
      if (mapping.destination_class_id) {
        errors.push(`“${source.name}” is set to graduate but also has a destination class.`);
      }
      continue;
    }

    if (mapping.action !== "promote") {
      errors.push(`“${source.name}” has an unknown action.`);
      continue;
    }

    if (!mapping.destination_class_id) {
      errors.push(`“${source.name}” needs a destination class, or choose Graduated.`);
      continue;
    }

    const destination = classById.get(mapping.destination_class_id);
    if (!destination) {
      errors.push(`The destination chosen for “${source.name}” does not belong to this school.`);
      continue;
    }

    if (destination.id === source.id) {
      errors.push(`“${source.name}” cannot be promoted to itself.`);
    }
  }

  return errors;
}

/**
 * Build the reviewable plan from the saved mappings and the school's students.
 *
 * Only students whose current class is the mapping's source class are
 * considered. Eligibility is decided here so the UI and the executor agree.
 */
export function buildPreview(args: {
  classes: PromotionClass[];
  mappings: Pick<SavedMapping, "source_class_id" | "destination_class_id" | "action">[];
  students: StudentForPreview[];
}): PromotionPreview {
  const { classes, mappings, students } = args;

  const classById = new Map(classes.map((c) => [c.id, c]));
  const mappingBySource = new Map(mappings.map((m) => [m.source_class_id, m]));

  const groups: PreviewGroup[] = [];
  const warnings: string[] = [];
  const handledStudentIds = new Set<string>();

  for (const source of [...classes].sort(byName)) {
    const mapping = mappingBySource.get(source.id);
    if (!mapping) continue;

    const destination =
      mapping.action === "promote" && mapping.destination_class_id
        ? classById.get(mapping.destination_class_id) ?? null
        : null;

    const inSource = students.filter((s) => s.class_id === source.id);
    const promotable: PreviewStudent[] = [];
    const flagged: FlaggedStudent[] = [];

    for (const student of inSource) {
      handledStudentIds.add(student.id);
      const reason = ineligibilityReason(student);
      if (reason) {
        flagged.push({ ...toPreviewStudent(student), reason });
      } else {
        promotable.push(toPreviewStudent(student));
      }
    }

    if (promotable.length === 0) {
      warnings.push(`“${source.name}” has no eligible students.`);
    }

    groups.push({
      source_class_id: source.id,
      source_class_name: source.name,
      action: mapping.action,
      destination_class_id: destination?.id ?? null,
      destination_class_name: destination?.name ?? null,
      students: promotable.sort(byName),
      flagged: flagged.sort(byName),
    });
  }

  const unconfigured_classes = classes
    .filter((c) => !mappingBySource.has(c.id))
    .sort(byName);

  // Students with no class, or a class that no longer exists. They are never
  // touched; they are surfaced for review. Students who merely belong to an
  // unconfigured class are covered by `unconfigured_classes`, not listed here.
  const unassigned: FlaggedStudent[] = students
    .filter(
      (s) =>
        !handledStudentIds.has(s.id) &&
        s.status !== "graduated" &&
        s.status !== "alumni" &&
        (!s.class_id || !classById.has(s.class_id)),
    )
    .map((s) => ({
      ...toPreviewStudent(s),
      reason: s.class_id
        ? "Current class is not part of the promotion configuration"
        : "No class assigned",
    }))
    .sort(byName);

  const totals = groups.reduce(
    (acc, group) => {
      acc.total += group.students.length;
      if (group.action === "graduate") acc.graduated += group.students.length;
      else acc.promoted += group.students.length;
      acc.flagged += group.flagged.length;
      return acc;
    },
    { total: 0, promoted: 0, graduated: 0, flagged: 0 },
  );

  return {
    groups,
    totals,
    unconfigured_classes,
    unassigned,
    warnings,
  };
}

/**
 * Freeze the preview into per-student run items.
 *
 * The `from_class_id` is recorded per student so execution can verify the
 * student is still there. This is what makes retries and chained mappings safe:
 * an already-moved student no longer matches `from_class_id` and is skipped.
 */
export function planRunItems(preview: PromotionPreview): RunItem[] {
  return preview.groups.flatMap((group) =>
    group.students.map((student) => ({
      student_id: student.id,
      from_class_id: group.source_class_id,
      to_class_id: group.action === "promote" ? group.destination_class_id : null,
      action: group.action,
    })),
  );
}
