/**
 * Class-assignment decisions shared by the student form and the audit trail.
 *
 * Deliberately CLIENT-SAFE: the school-admin student screen imports this, so it
 * must not reach for the service-role client. Everything that talks to the
 * database lives in `class-assignment.ts`; what is here is the small amount of
 * judgement both sides must agree on — what counts as "no class", what the
 * dropdown should show for an id the school does not own, and whether the
 * selection actually moved.
 */

/**
 * Dropdown value standing for "this student has a class id that is not in the
 * school's class list".
 *
 * Before this existed, such an id simply had no matching `<option>`, so the
 * browser displayed the first class in the list while the code still held the
 * old id. An admin editing only a phone number could therefore believe the
 * class was fine while the form carried a value nobody had chosen.
 */
export const UNKNOWN_CLASS = "__unknown__";

/**
 * `""`, whitespace, `null` and `undefined` all mean "not assigned".
 * Anything else is the trimmed id.
 */
export function normaliseClassId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

export type ClassChoice = {
  /** The value the `<select>` should hold. */
  value: string;
  /** True when the stored id is not one of this school's classes. */
  unknown: boolean;
};

/**
 * The dropdown value for a student that is about to be edited.
 *
 * The class list may not have loaded when the dialog opens; in that case the
 * stored id is kept as-is rather than being discarded on a guess. A stored id
 * that the loaded list does not contain becomes `UNKNOWN_CLASS`, which keeps the
 * form honest: the admin sees that something is wrong instead of a plausible
 * class they never picked.
 */
export function initialClassChoice(
  storedClassId: string | null | undefined,
  knownClassIds: readonly string[],
): ClassChoice {
  const stored = normaliseClassId(storedClassId);
  if (!stored) return { value: "", unknown: false };
  if (knownClassIds.length === 0) return { value: stored, unknown: false };
  if (knownClassIds.includes(stored)) return { value: stored, unknown: false };
  return { value: UNKNOWN_CLASS, unknown: true };
}

/**
 * Whether the class selection actually moved.
 *
 * `""`, `null` and `UNKNOWN_CLASS` are compared as they are — only a change of
 * the *choice* counts, so correcting a spelling never asks for confirmation.
 */
export function classSelectionChanged(initial: string, next: string): boolean {
  return (normaliseClassId(initial) ?? "") !== (normaliseClassId(next) ?? "");
}

/**
 * The confirmation sentence shown only when the class really changes.
 *
 * It names both ends of the move and states what does NOT happen, because the
 * thing admins actually worry about is whether last term's results follow the
 * child into the new class.
 */
export function describeClassMove(input: {
  studentName: string;
  fromLabel: string;
  toLabel: string;
}): string {
  const name = input.studentName.trim() || "This student";
  return (
    `Move ${name} from ${input.fromLabel} to ${input.toLabel}? ` +
    "Their existing scores, report cards and bills stay recorded under the class they were entered in — " +
    "changing class does not move or recalculate any of them."
  );
}

/** Human wording for a class, including the two non-class states. */
export function classLabel(
  classId: string | null | undefined,
  classNameById: ReadonlyMap<string, string>,
): string {
  if (classId === UNKNOWN_CLASS) return "an unknown class";
  const id = normaliseClassId(classId);
  if (!id) return "no class";
  return classNameById.get(id) ?? "an unknown class";
}
