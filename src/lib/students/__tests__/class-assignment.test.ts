import { describe, it, expect } from "vitest";
import { fakeSupabase, fakeError, fakeOk } from "@/lib/ai/__tests__/fake-supabase";
import {
  CLASS_CHANGE_ACTION,
  loadClassNames,
  loadSchoolClass,
  recordClassChange,
} from "../class-assignment";
import { UNKNOWN_CLASS } from "../class-change";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222";
const CLASS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TERM = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const STUDENT = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/**
 * The server half of class assignment.
 *
 * The route is the boundary: the dropdown is only a client, and the service-role
 * client means RLS is not a backstop. These tests are about that boundary — an
 * id from another school must be refused, "no class" must still be allowed, and
 * the audit trail must never be the reason a save fails.
 */

describe("loadSchoolClass", () => {
  it("does not query at all when there is no class", async () => {
    const fake = fakeSupabase();

    const result = await loadSchoolClass(fake.client, SCHOOL, null);

    expect(result).toEqual({ ok: true, klass: null });
    expect(fake.selects).toHaveLength(0);
  });

  it("accepts a class belonging to this school, scoped by both id and school", async () => {
    const fake = fakeSupabase({
      select: () => fakeOk([{ id: CLASS, name: "Basic 2" }]),
    });

    const result = await loadSchoolClass(fake.client, SCHOOL, CLASS);

    expect(result).toEqual({ ok: true, klass: { id: CLASS, name: "Basic 2" } });
    expect(fake.selects[0].table).toBe("classes");
    expect(fake.selects[0].filters).toEqual([
      ["id", CLASS],
      ["school_id", SCHOOL],
    ]);
  });

  it("refuses a class that the school-scoped query cannot find", async () => {
    const fake = fakeSupabase({ select: () => fakeOk([]) });

    const result = await loadSchoolClass(fake.client, OTHER_SCHOOL, CLASS);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "class_id does not belong to this school",
    });
    // The filter is what makes a foreign class indistinguishable from a missing
    // one — the route must never learn the name of another tenant's class.
    expect(fake.selects[0].filters).toContainEqual(["school_id", OTHER_SCHOOL]);
  });

  it("reports a database failure as a server error, not as a validation failure", async () => {
    const fake = fakeSupabase({ select: () => fakeError("connection reset") });

    const result = await loadSchoolClass(fake.client, SCHOOL, CLASS);

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(result.ok === false && result.error).toContain("connection reset");
  });
});

describe("loadClassNames", () => {
  it("returns names for the ids it can resolve and ignores the rest", async () => {
    const fake = fakeSupabase({
      select: () => fakeOk([{ id: CLASS, name: "Basic 2" }]),
    });

    const names = await loadClassNames(fake.client, SCHOOL, [CLASS, "gone"]);

    expect(names.get(CLASS)).toBe("Basic 2");
    expect(names.has("gone")).toBe(false);
  });

  it("asks nothing when there is nothing to name", async () => {
    const fake = fakeSupabase();
    expect(await loadClassNames(fake.client, SCHOOL, [])).toEqual(new Map());
    expect(fake.selects).toHaveLength(0);
  });

  it("returns a partial map rather than failing when the read fails", async () => {
    const fake = fakeSupabase({ select: () => fakeError("timeout") });
    expect((await loadClassNames(fake.client, SCHOOL, [CLASS])).size).toBe(0);
  });
});

describe("recordClassChange", () => {
  const change = {
    school_id: SCHOOL,
    user_id: USER,
    student_id: STUDENT,
    from: { id: "old-class", name: "Basic 1" },
    to: { id: CLASS, name: "Basic 2" },
    term_id: TERM,
  };

  it("writes the student, both classes and the acting user", async () => {
    const fake = fakeSupabase({ insert: () => fakeOk(null) });

    expect(await recordClassChange(fake.client, change)).toBe(true);

    const row = fake.inserts[0];
    expect(row.table).toBe("report_card_audit_logs");
    expect(row.row).toMatchObject({
      school_id: SCHOOL,
      class_id: CLASS,
      term_id: TERM,
      user_id: USER,
      action: CLASS_CHANGE_ACTION,
    });
    expect(row.row.details).toEqual({
      student_id: STUDENT,
      from_class_id: "old-class",
      from_class_name: "Basic 1",
      to_class_id: CLASS,
      to_class_name: "Basic 2",
    });
  });

  it("attributes an unassigned student to the class they are joining", async () => {
    const fake = fakeSupabase({ insert: () => fakeOk(null) });

    await recordClassChange(fake.client, { ...change, from: null });

    expect(fake.inserts[0].row.class_id).toBe(CLASS);
    expect((fake.inserts[0].row.details as Record<string, unknown>).from_class_id).toBeNull();
  });

  it("attributes a removal to the class they are leaving", async () => {
    const fake = fakeSupabase({ insert: () => fakeOk(null) });

    await recordClassChange(fake.client, { ...change, to: null });

    expect(fake.inserts[0].row.class_id).toBe("old-class");
  });

  it("writes nothing, and does not throw, when there is no class at all", async () => {
    const fake = fakeSupabase();

    expect(await recordClassChange(fake.client, { ...change, from: null, to: null })).toBe(false);
    expect(fake.inserts).toHaveLength(0);
  });

  it("skips a school with no active term instead of failing the update", async () => {
    const fake = fakeSupabase();

    expect(await recordClassChange(fake.client, { ...change, term_id: null })).toBe(false);
    expect(fake.inserts).toHaveLength(0);
  });

  it("skips a session with no user, because the column is NOT NULL", async () => {
    const fake = fakeSupabase();

    expect(await recordClassChange(fake.client, { ...change, user_id: null })).toBe(false);
    expect(fake.inserts).toHaveLength(0);
  });

  it("returns false when the insert fails, rather than throwing into the save", async () => {
    const fake = fakeSupabase({ insert: () => fakeError("permission denied") });

    await expect(recordClassChange(fake.client, change)).resolves.toBe(false);
  });
});

describe("UNKNOWN_CLASS sentinel", () => {
  it("is not a UUID, so it can never be mistaken for a class id", () => {
    expect(UNKNOWN_CLASS).not.toMatch(/^[0-9a-f-]{36}$/i);
    expect(UNKNOWN_CLASS.length).toBeGreaterThan(0);
  });
});
