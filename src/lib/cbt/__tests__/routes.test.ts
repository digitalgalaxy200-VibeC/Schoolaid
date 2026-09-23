import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";

import { GET as questionsGET, POST as questionsPOST } from "../../../app/api/cbt/questions/route";
import { GET as resultsGET } from "../../../app/api/cbt/assessments/[id]/results/route";
import { GET as markingGET } from "../../../app/api/cbt/assessments/[id]/marking/route";
import { GET as optionsGET } from "../../../app/api/cbt/assessments/options/route";
import { GET as studentAssessmentsGET } from "../../../app/api/cbt/student/assessments/route";
import { POST as publishPOST } from "../../../app/api/cbt/assessments/[id]/publish/route";

/**
 * D14-D20 — the CBT guard, through the REAL route handlers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The unit tests prove the decision functions are correct. They cannot prove a
 * route actually calls them, in the right order, before writing anything. These
 * tests invoke the exported route handlers and assert the HTTP status — the layer
 * a teacher or student actually experiences.
 *
 * `next/headers` is mocked so a signed session cookie can be supplied per case.
 * Everything below the cookie is real: the real guard, the real PostgREST, the
 * real RLS.
 *
 * FIXTURES ARE BUILT, THEN REMOVED. Staging has no teacher→subject→class
 * assignment at all (all five `teacher_subjects` rows are vacant), and the one
 * class with a published report card is locked — which would mask an
 * authorization result behind a lock error. So this test creates exactly the rows
 * it needs and deletes them in `afterAll`.
 *
 * OPT-IN, because it is a live test that writes to staging:
 *
 *     CBT_LIVE=1 npx vitest run src/lib/cbt/__tests__/routes.test.ts
 */

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "schoolaid-session" && h.cookie ? { name, value: h.cookie } : undefined,
  }),
}));

const REPO = path.join(__dirname, "..", "..", "..", "..");

function readEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of [".env.local", ".env.staging"]) {
    const p = path.join(REPO, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const env = readEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const JWT_SECRET = env.JWT_SECRET ?? "";
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

// Publish onto process.env: the modules under test read it directly, so holding
// these only in this file would leave the real client unconfigured while every
// assertion passed against a local copy.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
process.env.SUPABASE_JWT_SECRET ||= env.SUPABASE_JWT_SECRET ?? "";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= SERVICE_KEY;
process.env.JWT_SECRET ||= JWT_SECRET;

const RUN = process.env.CBT_LIVE === "1";
const IS_STAGING = REF === "noyegdgrfzopfrwjunot";

async function sessionCookie(claims: {
  sub: string;
  role: "teacher" | "school_admin" | "student";
  school_id: string;
  all_classes?: boolean;
}): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!RUN)("CBT route handlers — guard behaviour", () => {
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let schoolId = "";
  let assignedClassId = "";
  let teacherProfileId = "";
  let teacherId = "";
  let studentProfileId = "";
  let adminProfileId = "";
  let foreignSchoolId = "";

  /** Assessment on the class the teacher IS assigned to, and which is unlocked. */
  let assignedAssessmentId = "";
  /** Assessment on a class the teacher is NOT assigned to, also unlocked. */
  let unassignedAssessmentId = "";
  /** A draft with no questions, for exercising the publish readiness gate. */
  let draftAssessmentId = "";

  const PROBE_TITLE = "GUARD PROBE";
  let probeClassId = "";
  let probeAssignmentId = "";

  beforeAll(async () => {
    expect(IS_STAGING, `refusing to run against '${REF}' — staging only`).toBe(true);
    expect(JWT_SECRET, "JWT_SECRET is required to mint a session").not.toBe("");
    expect(SERVICE_KEY).not.toBe("");

    const { data: teacher } = await service
      .from("teachers")
      .select("id, profile_id, school_id")
      .not("profile_id", "is", null)
      .limit(1)
      .maybeSingle();
    expect(teacher, "need a teacher with a profile").not.toBeNull();
    teacherId = teacher!.id as string;
    teacherProfileId = teacher!.profile_id as string;
    schoolId = teacher!.school_id as string;

    const { data: term } = await service
      .from("academic_terms")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1)
      .maybeSingle();
    expect(term, "need a term").not.toBeNull();

    const { data: subjects } = await service
      .from("subjects")
      .select("id")
      .eq("school_id", schoolId)
      .limit(1);
    expect(subjects && subjects.length > 0, "need a subject").toBe(true);
    const subjectId = subjects![0].id as string;

    // The class the teacher will be assigned to.
    const { data: allClasses } = await service
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .limit(2);
    expect(allClasses && allClasses.length > 0, "need a class").toBe(true);
    assignedClassId = allClasses![0].id as string;

    // A component the class's template actually exposes, so the results route
    // can resolve it rather than stopping at "unbound component".
    const { data: link } = await service
      .from("class_components_templates")
      .select("template_id")
      .eq("class_id", assignedClassId)
      .eq("school_id", schoolId)
      .maybeSingle();
    expect(link?.template_id, "the class needs a components template").toBeTruthy();
    const { data: comps } = await service
      .from("components_rows")
      .select("id")
      .eq("template_id", link!.template_id as string)
      .limit(3);
    expect(comps && comps.length >= 2, "need two components").toBe(true);
    const componentId = comps![0].id as string;
    // A SECOND component, for the draft probe. The partial unique index
    // `cbt_one_assessment_per_component_slot` allows only one active assessment
    // per (class, term, subject, component) — which is PD-2 enforced — so two
    // probe assessments cannot share a component. The first run of this fixture
    // failed on exactly that, which is the index doing its job.
    const secondComponentId = comps![1].id as string;

    // ── Clean up anything a previous crashed run left behind ────────────────
    await service.from("cbt_assessments").delete().eq("school_id", schoolId).like("title", `${PROBE_TITLE}%`);
    await service
      .from("teacher_subjects")
      .delete()
      .eq("school_id", schoolId)
      .eq("teacher_id", teacherId);

    // Probe class: unlocked (no report_card_submissions row) and NOT assigned to
    // the teacher — the only way to test `all_classes` without a lock error
    // getting in the way. Component resolution falls back to the school template.
    const { data: probeClass, error: classError } = await service
      .from("classes")
      .insert({ school_id: schoolId, name: `${PROBE_TITLE} CLASS ${Date.now()}` })
      .select("id")
      .single();
    expect(classError, classError?.message).toBeNull();
    probeClassId = probeClass!.id as string;

    const { data: assignment, error: assignError } = await service
      .from("teacher_subjects")
      .insert({
        school_id: schoolId,
        teacher_id: teacherId,
        subject_id: subjectId,
        class_id: assignedClassId,
        is_active: true,
        role: "primary",
      })
      .select("id")
      .single();
    expect(assignError, assignError?.message).toBeNull();
    probeAssignmentId = assignment!.id as string;

    const stamp = `${PROBE_TITLE} ${Date.now()}`;

    const created = await Promise.all([
      service
        .from("cbt_assessments")
        .insert({
          school_id: schoolId,
          class_id: assignedClassId,
          subject_id: subjectId,
          term_id: term!.id,
          component_id: componentId,
          teacher_id: teacherId,
          title: `${stamp} assigned`,
          status: "published",
        })
        .select("id")
        .single(),
      service
        .from("cbt_assessments")
        .insert({
          school_id: schoolId,
          class_id: probeClassId,
          subject_id: subjectId,
          term_id: term!.id,
          component_id: componentId,
          teacher_id: teacherId,
          title: `${stamp} unassigned`,
          status: "published",
        })
        .select("id")
        .single(),
    ]);

    expect(created[0].error, created[0].error?.message).toBeNull();
    expect(created[1].error, created[1].error?.message).toBeNull();
    assignedAssessmentId = created[0].data!.id as string;
    unassignedAssessmentId = created[1].data!.id as string;

    // A draft with NO questions attached: publishing it must be refused by the
    // readiness gate, which is the whole point of the publish route.
    const { data: draft, error: e3 } = await service
      .from("cbt_assessments")
      .insert({
        school_id: schoolId,
        class_id: assignedClassId,
        subject_id: subjectId,
        term_id: term!.id,
        component_id: secondComponentId,
        teacher_id: teacherId,
        title: `${stamp} empty draft`,
        status: "draft",
      })
      .select("id")
      .single();
    expect(e3, e3?.message).toBeNull();
    draftAssessmentId = draft!.id as string;

    const { data: student } = await service
      .from("profiles")
      .select("id")
      .eq("school_id", schoolId)
      .eq("role", "student")
      .limit(1)
      .maybeSingle();
    studentProfileId = (student?.id as string) ?? "";

    const { data: admin } = await service
      .from("profiles")
      .select("id")
      .eq("school_id", schoolId)
      .eq("role", "school_admin")
      .limit(1)
      .maybeSingle();

    // Prefer a genuine school_admin. If this school has none, fall back to any
    // profile IN THIS SCHOOL: the guard reads the session's ROLE CLAIM (set at
    // login from the profile's role), so the claim is what can be tested here.
    // Inventing a profile row would mean fabricating an auth.users id, which is a
    // far worse thing to do to a live database.
    adminProfileId = (admin?.id as string) ?? teacherProfileId;

    const { data: schools } = await service
      .from("schools")
      .select("id")
      .neq("id", schoolId)
      .limit(1);
    foreignSchoolId = (schools?.[0]?.id as string) ?? "";
  });

  afterAll(async () => {
    // Leave staging exactly as it was found.
    await service.from("cbt_assessments").delete().eq("school_id", schoolId).like("title", `${PROBE_TITLE}%`);
    if (draftAssessmentId) await service.from("cbt_assessments").delete().eq("id", draftAssessmentId);
    if (probeAssignmentId) await service.from("teacher_subjects").delete().eq("id", probeAssignmentId);
    if (probeClassId) await service.from("classes").delete().eq("id", probeClassId);
  });

  const resultsUrl = (id: string) => `http://localhost:3000/api/cbt/assessments/${id}/results`;

  it("D14 — no session cookie is rejected with 401", async () => {
    h.cookie = undefined;
    const res = await questionsGET(new Request("http://localhost:3000/api/cbt/questions"));
    expect(res.status).toBe(401);
  });

  it("D14b — a malformed cookie is rejected with 401", async () => {
    h.cookie = "not.a.jwt";
    const res = await questionsGET(new Request("http://localhost:3000/api/cbt/questions"));
    expect(res.status).toBe(401);
  });

  it("D15 — a student cookie on a staff route is refused with 403", async () => {
    expect(studentProfileId, "need a student profile").not.toBe("");
    h.cookie = await sessionCookie({ sub: studentProfileId, role: "student", school_id: schoolId });
    const res = await questionsGET(new Request("http://localhost:3000/api/cbt/questions"));
    expect(res.status).toBe(403);
  });

  it("D18 — a school admin is allowed", async () => {
    h.cookie = await sessionCookie({ sub: adminProfileId, role: "school_admin", school_id: schoolId });
    const res = await questionsGET(new Request("http://localhost:3000/api/cbt/questions"));
    expect(res.status).toBe(200);
  });

  it("D17 — the teacher assigned to the assessment's class+subject is allowed", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await resultsGET(new Request(resultsUrl(assignedAssessmentId)), params(assignedAssessmentId));
    expect(res.status).toBe(200);
  });

  it("D16 — a teacher NOT assigned to that class+subject is refused with 403", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await resultsGET(
      new Request(resultsUrl(unassignedAssessmentId)),
      params(unassignedAssessmentId),
    );
    expect(res.status).toBe(403);
  });

  it("D20 — an all_classes teacher session reaches a class it is not assigned to", async () => {
    // Same teacher and same assessment as D16, which was refused. The ONLY
    // difference is the session flag — so a 200 here is attributable to it.
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
      all_classes: true,
    });
    const res = await resultsGET(
      new Request(resultsUrl(unassignedAssessmentId)),
      params(unassignedAssessmentId),
    );
    expect(res.status).toBe(200);
  });

  it("D19 — another school's token gets 404, revealing nothing about existence", async () => {
    expect(foreignSchoolId, "need a second school").not.toBe("");
    h.cookie = await sessionCookie({
      sub: adminProfileId,
      role: "school_admin",
      school_id: foreignSchoolId,
    });
    const res = await resultsGET(new Request(resultsUrl(assignedAssessmentId)), params(assignedAssessmentId));
    expect(res.status).toBe(404);
  });

  it("D19b — a non-existent assessment id also gets 404", async () => {
    h.cookie = await sessionCookie({ sub: adminProfileId, role: "school_admin", school_id: schoolId });
    const res = await resultsGET(
      new Request(resultsUrl("00000000-0000-0000-0000-0000000000ff")),
      params("00000000-0000-0000-0000-0000000000ff"),
    );
    // Identical to D19's status: the two cases are indistinguishable, which is
    // the property that stops this endpoint being used to probe for ids.
    expect(res.status).toBe(404);
  });

  it("a cross-origin mutating request is rejected with 403", async () => {
    h.cookie = await sessionCookie({ sub: adminProfileId, role: "school_admin", school_id: schoolId });
    const res = await questionsPOST(
      new Request("http://localhost:3000/api/cbt/questions", {
        method: "POST",
        headers: { origin: "https://notschoolaid.evil.com", "content-type": "application/json" },
        body: JSON.stringify({ question_type: "mcq", question_text: "x", marks: 1 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  // ── The marking worklist ─────────────────────────────────────────────────

  it("marking worklist — 401 without a session", async () => {
    h.cookie = undefined;
    const res = await markingGET(new Request("http://localhost:3000/x"), params(assignedAssessmentId));
    expect(res.status).toBe(401);
  });

  it("marking worklist — 403 for a student", async () => {
    h.cookie = await sessionCookie({ sub: studentProfileId, role: "student", school_id: schoolId });
    const res = await markingGET(new Request("http://localhost:3000/x"), params(assignedAssessmentId));
    expect(res.status).toBe(403);
  });

  it("marking worklist — 403 for a teacher not on that class", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await markingGET(
      new Request("http://localhost:3000/x"),
      params(unassignedAssessmentId),
    );
    expect(res.status).toBe(403);
  });

  it("marking worklist — 200 for the assigned teacher, listing the whole class", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await markingGET(new Request("http://localhost:3000/x"), params(assignedAssessmentId));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(body.summary.class_size).toBe(body.students.length);
    // The class roster is returned even though nobody has attempted — a list
    // built only from attempts would omit every student who has not sat it.
    expect(body.summary.attempted).toBe(0);
  });

  it("marking worklist — 404 for another school's token", async () => {
    h.cookie = await sessionCookie({
      sub: adminProfileId,
      role: "school_admin",
      school_id: foreignSchoolId,
    });
    const res = await markingGET(new Request("http://localhost:3000/x"), params(assignedAssessmentId));
    expect(res.status).toBe(404);
  });

  // ── Builder options ──────────────────────────────────────────────────────

  it("options — 401 without a session", async () => {
    h.cookie = undefined;
    const res = await optionsGET(new Request("http://localhost:3000/api/cbt/assessments/options"));
    expect(res.status).toBe(401);
  });

  it("options — 403 for a student", async () => {
    h.cookie = await sessionCookie({ sub: studentProfileId, role: "student", school_id: schoolId });
    const res = await optionsGET(new Request("http://localhost:3000/api/cbt/assessments/options"));
    expect(res.status).toBe(403);
  });

  it("options — 200 and the teacher sees their own classes, not the whole school", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await optionsGET(new Request("http://localhost:3000/api/cbt/assessments/options"));
    expect(res.status).toBe(200);

    const body = await res.json();
    const ids = (body.classes ?? []).map((c: { id: string }) => c.id);
    expect(ids).toContain(assignedClassId);
    // The probe class was created for this run and is assigned to nobody, so it
    // must not be offered.
    expect(ids).not.toContain(probeClassId);
  });

  it("options — 403 when asked for a class the teacher does not teach", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await optionsGET(
      new Request(
        `http://localhost:3000/api/cbt/assessments/options?class_id=${probeClassId}`,
      ),
    );
    expect(res.status).toBe(403);
  });

  // ── The student's own list ───────────────────────────────────────────────

  it("student list — 401 without a session", async () => {
    h.cookie = undefined;
    const res = await studentAssessmentsGET(new Request("http://localhost:3000/x"));
    expect(res.status).toBe(401);
  });

  it("student list — 403 for a teacher (it is a student-only view)", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await studentAssessmentsGET(new Request("http://localhost:3000/x"));
    expect(res.status).toBe(403);
  });

  it("student list — 200 for a student, with no paper and no answer key in it", async () => {
    expect(studentProfileId, "need a student profile").not.toBe("");
    h.cookie = await sessionCookie({ sub: studentProfileId, role: "student", school_id: schoolId });
    const res = await studentAssessmentsGET(new Request("http://localhost:3000/x"));
    expect(res.status).toBe(200);

    const raw = JSON.stringify(await res.json());
    // The whole point of this endpoint's shape: a student is not handed the paper
    // before starting it. Asserted on the serialised body so a future field
    // carrying a key would fail here rather than in production.
    expect(raw).not.toContain("correct_option_id");
    expect(raw).not.toContain("model_answer");
    expect(raw).not.toContain("marking_rubric");
  });

  // ── Publishing ───────────────────────────────────────────────────────────

  it("publish — refused with reasons when the paper has no questions", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await publishPOST(new Request("http://localhost:3000/x"), params(draftAssessmentId));
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(Array.isArray(body.problems)).toBe(true);
    expect(body.problems.join(" ")).toMatch(/no questions/);
  });

  it("publish — refused on an assessment that is already published", async () => {
    h.cookie = await sessionCookie({
      sub: teacherProfileId,
      role: "teacher",
      school_id: schoolId,
    });
    const res = await publishPOST(new Request("http://localhost:3000/x"), params(assignedAssessmentId));
    expect(res.status).toBe(409);
  });
});
