import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertClassInSchool, assertEmailUnused, assertInSchool } from "../tenant-guard";

/**
 * The service client bypasses RLS, so a plan could otherwise point a class_id /
 * teacher_id / session_id at another school's record. These tests pin both
 * halves of the guard: what it decides, and that the query is scoped by
 * `school_id` rather than trusting the id alone.
 */

type Result = { data: unknown; error: { message: string } | null };

/** A minimal stand-in for the query builder: eq() chains and records filters. */
function fakeClient(result: Result) {
  const filters: [string, unknown][] = [];
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    },
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return { client: { from: () => chain } as unknown as SupabaseClient, filters };
}

describe("assertInSchool", () => {
  it("returns the id when the record belongs to the school", async () => {
    const { client } = fakeClient({ data: { id: "c-1" }, error: null });
    await expect(assertClassInSchool(client, "c-1", "school-1")).resolves.toBe("c-1");
  });

  it("scopes the lookup by school_id, not just by id", async () => {
    const { client, filters } = fakeClient({ data: { id: "c-1" }, error: null });
    await assertClassInSchool(client, "c-1", "school-1");
    expect(filters).toContainEqual(["id", "c-1"]);
    expect(filters).toContainEqual(["school_id", "school-1"]);
  });

  it("refuses a record from another school", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(assertClassInSchool(client, "c-2", "school-1")).rejects.toThrow(
      /does not belong to this school/,
    );
  });

  it("refuses an empty or non-string id before querying", async () => {
    const { client, filters } = fakeClient({ data: { id: "c-1" }, error: null });
    await expect(assertClassInSchool(client, "", "school-1")).rejects.toThrow(/id is required/);
    await expect(assertClassInSchool(client, null, "school-1")).rejects.toThrow(/id is required/);
    expect(filters).toHaveLength(0);
  });

  it("surfaces a failed check instead of assuming permission", async () => {
    const { client } = fakeClient({ data: null, error: { message: "connection reset" } });
    await expect(assertInSchool(client, "subjects", "s-1", "school-1", "subject")).rejects.toThrow(
      /Could not verify the subject: connection reset/,
    );
  });
});

describe("assertEmailUnused", () => {
  it("passes when no profile holds the email", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(assertEmailUnused(client, "ada@tst.com")).resolves.toBeUndefined();
  });

  it("refuses an email that already belongs to an account", async () => {
    const { client } = fakeClient({ data: { id: "p-1" }, error: null });
    await expect(assertEmailUnused(client, "ada@tst.com")).rejects.toThrow(
      /already exists/,
    );
  });

  it("surfaces a failed check", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    await expect(assertEmailUnused(client, "ada@tst.com")).rejects.toThrow(
      /Could not check whether ada@tst.com is already in use: boom/,
    );
  });
});
