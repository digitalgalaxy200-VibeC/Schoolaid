import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase, fakeOk, type QuerySpec } from "@/lib/ai/__tests__/fake-supabase";

/**
 * Registration's class guard, pinned.
 *
 * `registerStudent` is the single provisioning path used by both the admin route
 * and the class-teacher flow, and it has always refused a class from another
 * school. This file exists because the ADMIN UPDATE route did not — the two were
 * inconsistent. Pinning the shared path means a future refactor cannot quietly
 * remove the check that was already right.
 *
 * The guard runs before any auth user is created, so a rejected class costs
 * nothing and a test never needs the network.
 */

const { getServiceClientMock } = vi.hoisted(() => ({ getServiceClientMock: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({ getServiceClient: getServiceClientMock }));

import { registerStudent } from "../registration";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const CLASS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function wire(classes: { id: string; name: string }[], schools: unknown[] = []) {
  const fake = fakeSupabase({
    select: (spec: QuerySpec) => {
      if (spec.table === "classes") return fakeOk(classes);
      if (spec.table === "schools") return fakeOk(schools);
      return fakeOk([]);
    },
  });
  getServiceClientMock.mockReturnValue(fake.client);
  return fake;
}

const input = (classId: string | null) => ({
  school_id: SCHOOL,
  first_name: "Titi",
  last_name: "Titi",
  class_id: classId,
});

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registerStudent — class ownership", () => {
  it("refuses a class that does not belong to the school", async () => {
    const fake = wire([]);

    const result = await registerStudent(input(CLASS));

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "class_id does not belong to this school",
    });
    // Scoped by school as well as id — that is what makes a foreign class
    // indistinguishable from a missing one.
    expect(fake.selects[0].filters).toEqual([
      ["id", CLASS],
      ["school_id", SCHOOL],
    ]);
  });

  it("goes on to provision when the class is the school's own", async () => {
    wire([{ id: CLASS, name: "Basic 1" }], []);

    const result = await registerStudent(input(CLASS));

    // It stops at the next step (the fake has no school row), which is proof
    // enough that the class guard let it through.
    expect(result).toEqual({ ok: false, status: 404, error: "School not found" });
  });

  it("accepts a student with no class, without looking one up", async () => {
    const fake = wire([], []);

    const result = await registerStudent(input(null));

    expect(result).toEqual({ ok: false, status: 404, error: "School not found" });
    expect(fake.selects.some((s) => s.table === "classes")).toBe(false);
  });
});
