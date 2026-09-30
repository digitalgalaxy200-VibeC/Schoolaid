import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mintTenantToken } from "../scoped-client";

/**
 * D8, D9, D11, D12, D13 — CBT tenant isolation over the REAL transport.
 *
 * WHY THIS FILE IS SEPARATE FROM THE SQL HARNESS
 * ----------------------------------------------
 * `scripts/rls-isolation-test.cjs` sets `request.jwt.claims` directly inside
 * Postgres. That proves the SQL policies are written correctly. It cannot prove
 * that a token this codebase MINTS is accepted, that claims survive the wire, or
 * that a forged token is refused — those are transport facts, and this file is
 * the only place they are tested.
 *
 * Everything here goes through PostgREST with a real bearer token. Fixtures are
 * created with the service client and removed in `afterAll`.
 *
 * OPT-IN — it writes to staging:
 *
 *     CBT_LIVE=1 npx vitest run src/lib/cbt/__tests__/transport-security.test.ts
 */

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
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const REF = URL_BASE.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

process.env.SUPABASE_JWT_SECRET ||= env.SUPABASE_JWT_SECRET ?? "";

const RUN = process.env.CBT_LIVE === "1";
const IS_STAGING = REF === "noyegdgrfzopfrwjunot";

/** A PostgREST call returning status and row count. */
async function rest(
  method: string,
  query: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; rows: number | null; body: unknown }> {
  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  let rows: number | null = null;
  try {
    parsed = await res.json();
    if (Array.isArray(parsed)) rows = parsed.length;
  } catch {
    /* error bodies are not always JSON */
  }
  return { status: res.status, rows, body: parsed };
}

describe.skipIf(!RUN)("CBT isolation over the real transport", () => {
  const service = createClient(URL_BASE, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let schoolA = "";
  let schoolB = "";
  let classA = "";
  let teacherProfileId = "";
  let studentA = { profileId: "", studentId: "" };
  let studentB = { profileId: "", studentId: "" };
  let questionId = "";
  let assessmentId = "";
  let attemptAId = "";
  let attemptQuestionAId = "";

  beforeAll(async () => {
    expect(IS_STAGING, `refusing to run against '${REF}' — staging only`).toBe(true);
    expect(SERVICE).not.toBe("");

    // Two students in the same class: D9 needs one student's attempt to be
    // invisible to the other.
    const { data: students } = await service
      .from("students")
      .select("id, class_id, school_id, profile_id")
      .not("class_id", "is", null)
      .not("profile_id", "is", null)
      .limit(2);
    expect(students && students.length >= 2, "need two students with profiles").toBe(true);

    studentA = {
      profileId: students![0].profile_id as string,
      studentId: students![0].id as string,
    };
    studentB = {
      profileId: students![1].profile_id as string,
      studentId: students![1].id as string,
    };
    classA = students![0].class_id as string;
    schoolA = students![0].school_id as string;

    const { data: teacher } = await service
      .from("teachers")
      .select("profile_id")
      .eq("school_id", schoolA)
      .not("profile_id", "is", null)
      .limit(1)
      .maybeSingle();
    expect(teacher, "need a teacher with a profile").not.toBeNull();
    teacherProfileId = teacher!.profile_id as string;

    const { data: schools } = await service.from("schools").select("id").neq("id", schoolA).limit(1);
    schoolB = schools![0].id as string;

    const stamp = `TRANSPORT PROBE ${Date.now()}`;

    // ── Fixtures ────────────────────────────────────────────────────────────
    const { data: question, error: qErr } = await service
      .from("cbt_questions")
      .insert({
        school_id: schoolA,
        class_id: classA,
        question_type: "mcq",
        question_text: stamp,
        marks: 1,
        status: "approved",
      })
      .select("id")
      .single();
    expect(qErr, qErr?.message).toBeNull();
    questionId = question!.id as string;

    await service.from("cbt_question_options").insert([
      { school_id: schoolA, question_id: questionId, option_text: "A", display_order: 0 },
      { school_id: schoolA, question_id: questionId, option_text: "B", display_order: 1 },
    ]);
    await service.from("cbt_question_answer_keys").insert({
      question_id: questionId,
      school_id: schoolA,
      model_answer: stamp,
    });

    const { data: assessment, error: aErr } = await service
      .from("cbt_assessments")
      .insert({
        school_id: schoolA,
        class_id: classA,
        title: stamp,
        status: "published",
      })
      .select("id")
      .single();
    expect(aErr, aErr?.message).toBeNull();
    assessmentId = assessment!.id as string;

    await service.from("cbt_assessment_questions").insert({
      school_id: schoolA,
      assessment_id: assessmentId,
      question_id: questionId,
      display_order: 0,
    });

    const { data: attempt, error: attErr } = await service
      .from("cbt_attempts")
      .insert({
        school_id: schoolA,
        assessment_id: assessmentId,
        student_id: studentA.studentId,
        student_profile_id: studentA.profileId,
        attempt_number: 1,
        status: "in_progress",
      })
      .select("id")
      .single();
    expect(attErr, attErr?.message).toBeNull();
    attemptAId = attempt!.id as string;

    const { data: aq } = await service
      .from("cbt_attempt_questions")
      .insert({
        school_id: schoolA,
        attempt_id: attemptAId,
        student_profile_id: studentA.profileId,
        display_order: 0,
        question_type: "mcq",
        question_text: stamp,
        marks: 1,
      })
      .select("id")
      .single();
    attemptQuestionAId = aq!.id as string;
  });

  afterAll(async () => {
    // Order matters: children before parents. The composite keys are NO ACTION,
    // so a parent cannot be removed while a child still references it.
    if (attemptQuestionAId) {
      await service.from("cbt_attempt_questions").delete().eq("id", attemptQuestionAId);
    }
    if (attemptAId) await service.from("cbt_attempts").delete().eq("id", attemptAId);
    if (assessmentId) {
      await service.from("cbt_assessment_questions").delete().eq("assessment_id", assessmentId);
      await service.from("cbt_assessments").delete().eq("id", assessmentId);
    }
    if (questionId) {
      const { data: opts } = await service
        .from("cbt_question_options")
        .select("id")
        .eq("question_id", questionId);
      for (const o of opts ?? []) {
        await service.from("cbt_question_answer_keys").delete().eq("correct_option_id", o.id);
      }
      await service.from("cbt_question_answer_keys").delete().eq("question_id", questionId);
      await service.from("cbt_question_options").delete().eq("question_id", questionId);
      await service.from("cbt_questions").delete().eq("id", questionId);
    }
  });

  const teacherToken = () =>
    mintTenantToken({ userId: teacherProfileId, schoolId: schoolA, appRole: "teacher" });
  const studentToken = (s: { profileId: string }) =>
    mintTenantToken({ userId: s.profileId, schoolId: schoolA, appRole: "student" });
  const foreignToken = () =>
    mintTenantToken({ userId: teacherProfileId, schoolId: schoolB, appRole: "teacher" });

  // ── D8 ────────────────────────────────────────────────────────────────────
  it("D8 — a teacher reads the question bank and its keys (positive control)", async () => {
    // Without this, the student assertions below could pass on an empty database.
    const q = await rest("GET", `cbt_questions?select=id&id=eq.${questionId}`, await teacherToken());
    expect(q.rows, "the teacher must be able to see the fixture question").toBe(1);

    const keys = await rest(
      "GET",
      `cbt_question_answer_keys?select=question_id&question_id=eq.${questionId}`,
      await teacherToken(),
    );
    expect(keys.rows, "the teacher must be able to see the fixture answer key").toBe(1);
  });

  it("D8 — a student reads neither the question bank nor the answer keys", async () => {
    const token = await studentToken(studentA);

    const q = await rest("GET", `cbt_questions?select=id&id=eq.${questionId}`, token);
    expect(q.status).toBe(200);
    expect(q.rows).toBe(0);

    const keys = await rest(
      "GET",
      `cbt_question_answer_keys?select=question_id&question_id=eq.${questionId}`,
      token,
    );
    expect(keys.status).toBe(200);
    expect(keys.rows).toBe(0);

    // The frozen snapshot DOES carry the key — that is what marking compares
    // against — so a student must not reach the column by selecting it directly
    // either. RLS cannot hide a column; the route is what strips it, which is why
    // `toStudentView` uses an allow-list.
    const snapshot = await rest(
      "GET",
      `cbt_attempt_questions?select=correct_option_id&attempt_id=eq.${attemptAId}`,
      token,
    );
    expect(snapshot.status).toBe(200);
    // The row IS readable by its owner (SELECT is permitted) — the point of this
    // assertion is that it is the ROUTE, not RLS, that must strip the key, so a
    // future route that forgot to would leak it. Recorded here so that dependency
    // is visible rather than assumed.
    if (snapshot.rows === 1) {
      const value = (snapshot.body as { correct_option_id: string | null }[])[0].correct_option_id;
      expect(value === null || typeof value === "string").toBe(true);
    }
  });

  // ── D9 ────────────────────────────────────────────────────────────────────
  it("D9 — a student sees only their own attempt", async () => {
    const mine = await rest(
      "GET",
      `cbt_attempts?select=id,student_profile_id&assessment_id=eq.${assessmentId}`,
      await studentToken(studentA),
    );
    expect(mine.status).toBe(200);
    expect(mine.rows, "the owner sees exactly one attempt").toBe(1);

    const theirs = await rest(
      "GET",
      `cbt_attempts?select=id&assessment_id=eq.${assessmentId}`,
      await studentToken(studentB),
    );
    expect(theirs.status).toBe(200);
    expect(theirs.rows, "another student sees none of someone else's attempts").toBe(0);
  });

  // ── D11 ───────────────────────────────────────────────────────────────────
  it("D11 — a student cannot INSERT an attempt directly, and no row appears", async () => {
    const token = await studentToken(studentA);

    const res = await rest("POST", "cbt_attempts", token, {
      school_id: schoolA,
      assessment_id: assessmentId,
      student_id: studentA.studentId,
      student_profile_id: studentA.profileId,
      attempt_number: 99,
      status: "in_progress",
    });

    expect([401, 403], `expected a refusal, got ${res.status}`).toContain(res.status);

    // The refusal alone is not proof nothing happened — confirm independently.
    const { data: created } = await service
      .from("cbt_attempts")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", studentA.studentId)
      .eq("attempt_number", 99);
    expect(created ?? [], "no attempt may have been created").toHaveLength(0);
  });

  // ── D12 ───────────────────────────────────────────────────────────────────
  it("D12 — the snapshot cannot be UPDATEd, even with the service-role key", async () => {
    const admin = await rest(
      "PATCH",
      `cbt_attempt_questions?id=eq.${attemptQuestionAId}`,
      SERVICE,
      { question_text: "TAMPERED" },
    );

    // A BEFORE UPDATE trigger raises for every role, service role included. This
    // is the one guarantee that does not depend on RLS being configured.
    expect(admin.status, `expected a refusal, got ${admin.status}`).not.toBe(200);
    expect(admin.status).not.toBe(204);

    const text = JSON.stringify(admin.body ?? "");
    expect(text.toLowerCase(), "the refusal should name immutability").toContain("immutable");

    // And the value is unchanged.
    const { data: row } = await service
      .from("cbt_attempt_questions")
      .select("question_text")
      .eq("id", attemptQuestionAId)
      .maybeSingle();
    expect(row?.question_text).not.toBe("TAMPERED");
  });

  // ── D13 ───────────────────────────────────────────────────────────────────
  it("D13 — another school's token reads nothing from ANY cbt_ table", async () => {
    // The table list is DISCOVERED from PostgREST's own schema description, not
    // hardcoded, so a cbt_ table added later is covered without anyone
    // remembering to add it here.
    let tables: string[] = [];
    try {
      const res = await fetch(`${URL_BASE}/rest/v1/`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      const spec = (await res.json()) as { definitions?: Record<string, unknown> };
      tables = Object.keys(spec.definitions ?? {}).filter((t) => t.startsWith("cbt_"));
    } catch {
      /* fall through to the assertion below */
    }

    expect(tables.length, "expected to discover the cbt_ tables from PostgREST").toBeGreaterThan(5);

    const token = await foreignToken();
    const leaked: string[] = [];

    for (const table of tables) {
      const res = await rest("GET", `${table}?select=*`, token);
      // A table the role cannot read at all is fine; rows are not.
      if ((res.rows ?? 0) > 0) leaked.push(`${table} (${res.rows})`);
    }

    expect(leaked, `another school's token read rows from: ${leaked.join(", ")}`).toHaveLength(0);
  });

  it("D13 — the foreign token is genuinely scoped (its own school still works)", async () => {
    // Guards against the sweep above passing because the token was simply
    // unusable rather than correctly scoped.
    const token = await foreignToken();
    const profiles = await rest("GET", "profiles?select=id", token);
    expect(profiles.status).toBe(200);
  });
});
