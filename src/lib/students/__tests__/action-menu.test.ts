import { describe, it, expect } from "vitest";
import { buildStudentMenu, type StudentMenuContext } from "../action-menu";

const context = (over: Partial<StudentMenuContext> = {}): StudentMenuContext => ({
  archived: false,
  canManage: true,
  canViewRecords: true,
  canRestore: false,
  isSuperAdmin: false,
  ...over,
});

const actionsFor = (ctx: StudentMenuContext) =>
  buildStudentMenu(ctx).flatMap((group) => group.actions);

describe("buildStudentMenu — active students", () => {
  it("offers the full roster-owner set", () => {
    expect(actionsFor(context())).toEqual([
      "details",
      "edit",
      "records",
      "status",
      "reset",
      "archive",
    ]);
  });

  it("offers a view-only set to a teacher who does not own the roster", () => {
    const actions = actionsFor(context({ canManage: false }));
    // A subject teacher may look, but editing and resetting are the form
    // teacher's acts, like adding and archiving.
    expect(actions).toEqual(["details", "records", "status"]);
    expect(actions).not.toContain("edit");
    expect(actions).not.toContain("reset");
    expect(actions).not.toContain("archive");
  });

  it("hides academic records when the class is outside the caller's scope", () => {
    expect(actionsFor(context({ canViewRecords: false }))).not.toContain("records");
  });

  it("never shows restore or permanent delete for a live record", () => {
    const actions = actionsFor(context({ canRestore: true, isSuperAdmin: true }));
    expect(actions).not.toContain("restore");
    expect(actions).not.toContain("delete");
  });
});

describe("buildStudentMenu — archived students", () => {
  it("replaces the active actions with restore", () => {
    const actions = actionsFor(context({ archived: true, canRestore: true }));
    expect(actions).toEqual(["details", "records", "status", "restore"]);
    expect(actions).not.toContain("edit");
    expect(actions).not.toContain("reset");
    expect(actions).not.toContain("archive");
  });

  it("omits restore when the record belongs to another class", () => {
    const actions = actionsFor(context({ archived: true, canRestore: false }));
    expect(actions).not.toContain("restore");
    expect(actions).toContain("details");
  });

  it("shows permanent delete only to a super admin", () => {
    expect(
      actionsFor(context({ archived: true, canRestore: true, isSuperAdmin: true })),
    ).toContain("delete");
    expect(
      actionsFor(context({ archived: true, canRestore: true, isSuperAdmin: false })),
    ).not.toContain("delete");
  });

  it("keeps details and status available for an out-of-scope archived record", () => {
    const actions = actionsFor(
      context({ archived: true, canRestore: false, canViewRecords: false }),
    );
    expect(actions).toEqual(["details", "status"]);
  });
});

describe("buildStudentMenu — grouping", () => {
  it("groups actions into the documented sections", () => {
    const groups = buildStudentMenu(context({ archived: true, canRestore: true }));
    expect(groups.map((group) => group.label)).toEqual([
      "Student Information",
      "Account Management",
      "Status & Records",
    ]);
  });

  it("drops an empty section instead of rendering a heading with nothing under it", () => {
    const groups = buildStudentMenu(
      context({ archived: true, canRestore: false, isSuperAdmin: false }),
    );
    expect(groups.some((group) => group.label === "Status & Records")).toBe(false);
  });
});
