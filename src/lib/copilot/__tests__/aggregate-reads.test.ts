import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeOk, fakeSupabase } from "@/lib/ai/__tests__/fake-supabase";

/**
 * The aggregate reads, through the real capability dispatch.
 *
 * Two things are being protected here:
 *   - the answer is a NUMBER, not a page of rows the model would have to count;
 *   - every query carries the session's school_id. A count is small, but a count
 *     taken from the wrong tenant is still a leak.
 */

const state = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => state.client as SupabaseClient,
}));

import { executeReadCapability } from "../execution-engine";

const SCHOOL = "11111111-1111-1111-1111-111111111111";

describe("count_students", () => {
  it("returns an exact count, the filter it applied, and the class name", async () => {
    const fake = fakeSupabase({
      select: (spec) => {
        if (spec.table === "students") return fakeOk([{ id: "s1" }, { id: "s2" }, { id: "s3" }]);
        if (spec.table === "classes") return fakeOk([{ id: "c1", name: "Basic 1" }]);
        return fakeOk([]);
      },
    });
    state.client = fake.client;

    const result = (await executeReadCapability(
      "count_students",
      { class_id: "c1" },
      SCHOOL,
    )) as Record<string, unknown>;

    expect(result.count).toBe(3);
    expect(result.class_name).toBe("Basic 1");
    // Default is active, and the answer says so.
    expect(result.status).toBe("active");

    const studentsRead = fake.selects.find((s) => s.table === "students")!;
    expect(studentsRead.head, "a head count, not a page of names").toBe(true);
    expect(studentsRead.filters).toContainEqual(["school_id", SCHOOL]);
    expect(studentsRead.filters).toContainEqual(["class_id", "c1"]);
    expect(studentsRead.filters).toContainEqual(["profiles.is_active", true]);
  });

  it("asks for no status filter when every student is wanted", async () => {
    const fake = fakeSupabase({ select: () => fakeOk([{ id: "s1" }]) });
    state.client = fake.client;

    const result = (await executeReadCapability(
      "count_students",
      { status: "all" },
      SCHOOL,
    )) as Record<string, unknown>;

    expect(result.status).toBe("all");
    expect(String(result.note)).toContain("archived");

    const studentsRead = fake.selects.find((s) => s.table === "students")!;
    expect(studentsRead.filters).toContainEqual(["school_id", SCHOOL]);
    expect(studentsRead.filters.some(([column]) => column === "profiles.is_active")).toBe(false);
  });

  it("refuses a class that belongs to another school", async () => {
    const fake = fakeSupabase({
      select: (spec) => (spec.table === "students" ? fakeOk([{ id: "s1" }]) : fakeOk([])),
    });
    state.client = fake.client;

    await expect(
      executeReadCapability("count_students", { class_id: "other-tenant" }, SCHOOL),
    ).rejects.toThrow(/does not belong to this school/);
  });
});

describe("count_by_class", () => {
  it("returns one row per class, biggest first, including empty classes", async () => {
    const fake = fakeSupabase({
      select: (spec) => {
        if (spec.table === "students") {
          return fakeOk([{ class_id: "c1" }, { class_id: "c1" }, { class_id: "c2" }, { class_id: null }]);
        }
        if (spec.table === "classes") {
          return fakeOk([
            { id: "c1", name: "Basic 1" },
            { id: "c2", name: "Basic 2" },
            { id: "c3", name: "Basic 3" },
          ]);
        }
        return fakeOk([]);
      },
    });
    state.client = fake.client;

    const result = (await executeReadCapability("count_by_class", {}, SCHOOL)) as {
      total: number;
      unassigned: number;
      classes: { class: string; students: number }[];
    };

    expect(result.total).toBe(4);
    expect(result.unassigned).toBe(1);
    expect(result.classes).toEqual([
      { class_id: "c1", class: "Basic 1", students: 2 },
      { class_id: "c2", class: "Basic 2", students: 1 },
      { class_id: "c3", class: "Basic 3", students: 0 },
    ]);

    // Both queries are tenant-scoped.
    for (const read of fake.selects) {
      expect(read.filters, read.table).toContainEqual(["school_id", SCHOOL]);
    }
  });
});

describe("term_summary", () => {
  it("summarises the active term from submissions and result rows", async () => {
    const fake = fakeSupabase({
      select: (spec) => {
        switch (spec.table) {
          case "academic_terms":
            return fakeOk([{ id: "t1", name: "First Term", session_id: "sess1" }]);
          case "academic_sessions":
            return fakeOk([{ id: "sess1", name: "2026/2027" }]);
          case "classes":
            return fakeOk([{}, {}, {}]);
          case "report_card_submissions":
            return fakeOk([
              { class_id: "c1", status: "published" },
              { class_id: "c2", status: "approved" },
            ]);
          case "term_results":
            return fakeOk(new Array(40).fill({}));
          default:
            return fakeOk([]);
        }
      },
    });
    state.client = fake.client;

    const result = (await executeReadCapability("term_summary", {}, SCHOOL)) as {
      session: { name: string } | null;
      term: { name: string };
      classes: { total: number; published: number; approved: number; not_started: number };
      result_rows: number;
      ready_to_publish: number;
    };

    expect(result.session?.name).toBe("2026/2027");
    expect(result.term.name).toBe("First Term");
    expect(result.classes).toMatchObject({
      total: 3,
      published: 1,
      approved: 1,
      not_started: 1,
    });
    expect(result.result_rows).toBe(40);
    expect(result.ready_to_publish).toBe(1);

    for (const read of fake.selects) {
      expect(read.filters, read.table).toContainEqual(["school_id", SCHOOL]);
    }
  });

  it("says so plainly when the school has no active term", async () => {
    const fake = fakeSupabase({ select: () => fakeOk([]) });
    state.client = fake.client;

    const result = (await executeReadCapability("term_summary", {}, SCHOOL)) as {
      term: null;
      note: string;
    };

    expect(result.term).toBeNull();
    expect(result.note).toContain("No active term");
  });
});
