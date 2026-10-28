import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fakeSupabase,
  fakeError,
  fakeOk,
  type FakeOptions,
  type QuerySpec,
} from "@/lib/ai/__tests__/fake-supabase";

/**
 * The student update API, through the real handler.
 *
 * The defect this file exists for: `class_id` from the request body was written
 * to `students` without ever being checked against the caller's school. Because
 * the route uses the service-role key, RLS was not a backstop either — a stale
 * or crafted id could point a student at another tenant's class, after which the
 * child disappeared from every roster in their own school (rosters filter by
 * school AND class) with no audit row to explain it.
 *
 * These tests are therefore about the BOUNDARY, not the happy path:
 *   - a foreign class is a 400 and nothing is written;
 *   - an own class is accepted, and only students/profiles are touched;
 *   - "no class" still works;
 *   - a class change is audited, and an audit failure never fails the save.
 */

const { verifySchoolAdminMock, getServiceClientMock, getActiveTermMock } = vi.hoisted(() => ({
  verifySchoolAdminMock: vi.fn(),
  getServiceClientMock: vi.fn(),
  getActiveTermMock: vi.fn(),
}));

vi.mock("@/lib/school-auth", () => ({ verifySchoolAdmin: verifySchoolAdminMock }));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: getServiceClientMock }));
vi.mock("@/lib/report-card", () => ({ getActiveTerm: getActiveTermMock }));

import { PUT } from "@/app/api/school-admin/students/route";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222";
const OLD_CLASS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NEW_CLASS = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TERM = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const STUDENT = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const PROFILE = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const CLASS_ROWS = [
  { id: OLD_CLASS, name: "Basic 1" },
  { id: NEW_CLASS, name: "Basic 2" },
];

function wire(options: FakeOptions = {}, authorized = true) {
  verifySchoolAdminMock.mockResolvedValue(
    authorized
      ? { authorized: true, school_id: SCHOOL, userId: USER, impersonated: false }
      : { authorized: false, school_id: null, userId: null, impersonated: false },
  );
  getActiveTermMock.mockResolvedValue({ id: TERM, name: "First Term", session_name: "2026/2027" });
  const fake = fakeSupabase(options);
  getServiceClientMock.mockReturnValue(fake.client);
  return fake;
}

/** Students come from the roster query; classes from the ownership checks. */
const defaultSelect =
  (students: Record<string, unknown>[], classes = CLASS_ROWS) =>
  (spec: QuerySpec) => {
    if (spec.table === "students") return fakeOk(students);
    if (spec.table === "classes") return fakeOk(classesFor(spec, classes));
    return fakeOk([]);
  };

/**
 * Answer a classes query the way PostgREST would, honouring the id filter.
 * Returning every class regardless of the filter would make `maybeSingle()`
 * hand the route whichever class happened to be first — and the test would
 * then be asserting the fixture's order, not the route's behaviour.
 */
const classesFor = (spec: QuerySpec, classes: { id: string; name: string }[]) => {
  const idFilter = spec.filters.find(([column]) => column === "id");
  if (!idFilter) return classes;
  const value = idFilter[1];
  return classes.filter((c) =>
    Array.isArray(value) ? value.includes(c.id) : c.id === value,
  );
};

const student = (classId: string | null) => ({
  id: STUDENT,
  profile_id: PROFILE,
  class_id: classId,
  first_name: "Titi",
  last_name: "Titi",
});

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/school-admin/students", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: STUDENT, ...(body as Record<string, unknown>) }),
  });

const updateFor = (fake: ReturnType<typeof fakeSupabase>, table: string) =>
  fake.updates.filter((u) => u.table === table);

const auditInserts = (fake: ReturnType<typeof fakeSupabase>) =>
  fake.inserts.filter((i) => i.table === "report_card_audit_logs");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/school-admin/students — class ownership", () => {
  it("refuses a class that belongs to another school, and writes nothing", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)], []),
    });

    const res = await PUT(putRequest({ first_name: "Titi", class_id: OTHER_SCHOOL }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("class_id does not belong to this school");
    expect(fake.updates).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it("accepts a class from this school and moves the student", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
    });

    const res = await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(res.status).toBe(200);
    const writes = updateFor(fake, "students");
    expect(writes).toHaveLength(1);
    expect(writes[0].row.class_id).toBe(NEW_CLASS);
    // The school is part of the WHERE clause, so the write cannot cross tenants.
    expect(writes[0].filters).toContainEqual(["school_id", SCHOOL]);
  });

  it("checks the class before writing anything it was asked to change", async () => {
    // A rejected request must not half-apply the other fields either.
    const fake = wire({ select: defaultSelect([student(OLD_CLASS)], []) });

    await PUT(putRequest({ first_name: "Changed", class_id: OTHER_SCHOOL }));

    expect(fake.updates).toHaveLength(0);
    expect(updateFor(fake, "profiles")).toHaveLength(0);
  });

  it("still allows 'not assigned'", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
    });

    const res = await PUT(putRequest({ class_id: "" }));

    expect(res.status).toBe(200);
    expect(updateFor(fake, "students")[0].row.class_id).toBeNull();
  });

  it("treats null the same as an empty class", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
    });

    const res = await PUT(putRequest({ class_id: null }));

    expect(res.status).toBe(200);
    expect(updateFor(fake, "students")[0].row.class_id).toBeNull();
  });

  it("does not query classes at all when the class is not part of the request", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
    });

    const res = await PUT(putRequest({ first_name: "Titi" }));

    expect(res.status).toBe(200);
    expect(fake.selects.some((s) => s.table === "classes")).toBe(false);
    // Only the profile changed; the students row was left alone entirely.
    expect(updateFor(fake, "students")).toHaveLength(0);
    expect(updateFor(fake, "profiles")[0].row.first_name).toBe("Titi");
  });

  it("refuses an unauthenticated caller before touching the database", async () => {
    const fake = wire({}, false);

    const res = await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(res.status).toBe(401);
    expect(fake.selects).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("reports a database failure while verifying the class as a 500, not a 400", async () => {
    const fake = wire({
      select: (spec) =>
        spec.table === "classes" ? fakeError("connection reset") : fakeOk([student(OLD_CLASS)]),
    });

    const res = await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(res.status).toBe(500);
    expect(fake.updates).toHaveLength(0);
  });
});

describe("PUT /api/school-admin/students — audit trail", () => {
  it("records the student, both classes and the acting user", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
      insert: () => fakeOk(null),
    });

    await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(auditInserts(fake)).toHaveLength(1);
    expect(auditInserts(fake)[0].row).toMatchObject({
      school_id: SCHOOL,
      class_id: NEW_CLASS,
      term_id: TERM,
      user_id: USER,
      action: "student_class_change",
      details: {
        student_id: STUDENT,
        from_class_id: OLD_CLASS,
        from_class_name: "Basic 1",
        to_class_id: NEW_CLASS,
        to_class_name: "Basic 2",
      },
    });
  });

  it("writes no audit row when the class did not change", async () => {
    // Requirement: correcting a name is not a class change.
    const fake = wire({
      select: defaultSelect([student(NEW_CLASS)]),
      update: () => fakeOk(null),
      insert: () => fakeOk(null),
    });

    const res = await PUT(putRequest({ first_name: "Titi", class_id: NEW_CLASS }));

    expect(res.status).toBe(200);
    expect(auditInserts(fake)).toHaveLength(0);
  });

  it("succeeds even when the audit insert fails", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
      insert: () => fakeError("permission denied for table report_card_audit_logs"),
    });

    const res = await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(res.status).toBe(200);
    expect(updateFor(fake, "students")[0].row.class_id).toBe(NEW_CLASS);
  });

  it("succeeds when the school has no active term, and logs that it could not audit", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
      insert: () => fakeOk(null),
    });
    getActiveTermMock.mockResolvedValue(null);

    const res = await PUT(putRequest({ class_id: NEW_CLASS }));

    expect(res.status).toBe(200);
    expect(auditInserts(fake)).toHaveLength(0);
  });
});

describe("PUT /api/school-admin/students — history is untouched", () => {
  it("writes only to students and profiles", async () => {
    // Requirement: a class change must not rewrite scores, fees or term results.
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
      insert: () => fakeOk(null),
    });

    await PUT(putRequest({ first_name: "Titi", class_id: NEW_CLASS }));

    const written = new Set(fake.updates.map((u) => u.table));
    expect([...written].sort()).toEqual(["profiles", "students"]);
    expect(written.has("student_scores")).toBe(false);
    expect(written.has("student_fees")).toBe(false);
    expect(written.has("term_results")).toBe(false);
  });

  it("identifies the student by id AND school", async () => {
    const fake = wire({
      select: defaultSelect([student(OLD_CLASS)]),
      update: () => fakeOk(null),
    });

    await PUT(putRequest({ first_name: "Titi" }));

    const lookup = fake.selects.find((s) => s.table === "students");
    expect(lookup?.filters).toEqual([
      ["id", STUDENT],
      ["school_id", SCHOOL],
    ]);
  });
});
