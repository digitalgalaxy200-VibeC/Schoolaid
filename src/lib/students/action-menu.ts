/**
 * Which student-actions a row menu may offer.
 *
 * The two dashboards render the same menu, but their permissions differ. Keeping
 * the decision here (rather than in each page) means the rule is testable and
 * the two screens cannot drift:
 *
 *   - Archived students never offer Edit, Reset Password or Archive. They offer
 *     Restore only to someone allowed to restore that record.
 *   - Academic records are only offered when the caller can see the student's
 *     class.
 *   - Permanent delete is the existing super-admin-only action and is never
 *     shown on a live record.
 *
 * This is presentation logic only. Every endpoint re-checks the same scope.
 */

export type StudentMenuAction =
  | "details"
  | "edit"
  | "records"
  | "status"
  | "reset"
  | "archive"
  | "restore"
  | "delete";

export type StudentMenuContext = {
  archived: boolean;
  /** The caller owns this class's roster (form teacher, or school admin). */
  canManage: boolean;
  /** The caller may read this student's class (records route authorises it). */
  canViewRecords: boolean;
  /** An archived record this caller may restore. */
  canRestore: boolean;
  /** Existing super-admin-only permanent delete. */
  isSuperAdmin?: boolean;
};

export type StudentMenuGroup = {
  label: string;
  actions: StudentMenuAction[];
};

export function buildStudentMenu(context: StudentMenuContext): StudentMenuGroup[] {
  const information: StudentMenuAction[] = ["details"];
  if (!context.archived) information.push("edit");
  if (context.canViewRecords) information.push("records");

  const account: StudentMenuAction[] = ["status"];
  if (!context.archived) account.push("reset");

  const statusItems: StudentMenuAction[] = [];
  if (context.archived) {
    if (context.canRestore) statusItems.push("restore");
    if (context.isSuperAdmin) statusItems.push("delete");
  } else if (context.canManage) {
    statusItems.push("archive");
  }

  return [
    { label: "Student Information", actions: information },
    { label: "Account Management", actions: account },
    { label: "Status & Records", actions: statusItems },
  ].filter((group) => group.actions.length > 0);
}
