/**
 * Why a plan was refused — in words a Super Admin can act on.
 *
 * `validatePlan` answers a machine question ("is this executable?") with machine
 * sentences like `Step 2: "create_class" is a write operation but mode is
 * read_only`. The panel used to show only "This plan cannot be executed" and
 * leave the reason in a `details` field nobody read, which is how a person ends
 * up staring at a button that did nothing.
 *
 * This turns those sentences into the answer they actually want, and the same
 * string is used to warn BEFORE the click and to explain AFTER it, so the two
 * can never disagree.
 */

/** The one refusal worth naming: the plan was built in the analysis-only mode. */
export const READ_ONLY_PLAN_REASON =
  "This plan was created in Read-Only mode, so it can't be executed — a plan remembers the mode it was created in. Switch the toggle to Operations and ask again.";

const READ_ONLY_ERROR = /write operation but mode is read_only/;

export function explainPlanRefusal(errors: string[]): string {
  if (errors.length === 0) return "This plan could not be executed.";

  const others = errors.filter((error) => !READ_ONLY_ERROR.test(error));
  const parts: string[] = [];

  if (others.length !== errors.length) parts.push(READ_ONLY_PLAN_REASON);
  if (others.length > 0) parts.push(`The plan did not pass its checks: ${others.join("; ")}.`);

  return parts.join(" ");
}
