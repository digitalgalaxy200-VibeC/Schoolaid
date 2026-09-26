import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { POST as reviewPOST } from "../../app/api/school-admin/report-card-review/[classId]/route";
import { GET as reviewLogsGET } from "../../app/api/school-admin/report-card-review/[classId]/logs/route";
import { GET as studentCardGET } from "../../app/api/student/report-card/[termId]/route";

/**
 * Phase 11, end to end, against STAGING.
 *
 * THE RULE UNDER TEST
 * -------------------
 *   A published report card must not change because the school later changed its
 *   live configuration (grading bands, component names, trait names, remarks).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `report-card-snapshot.test.ts` proves the RULE against a fake client, and
 * `buildSnapshotPatch` against a fake database. Neither can prove the three things
 * that actually have to hold in production:
 *
 *   1. the publish path WRITES a snapshot (not just that it could);
 *   2. the student-facing route READS it back (not just that a resolver exists);
 *   3. the two agree — the card rendered after a live-configuration change is
 *      byte-identical to the one rendered before it.
 *
 * That needs three real tables, two real sessions, and the real HTTP handlers.
 *
 * FIXTURES ARE SELF-CONTAINED AND DELETED IN afterAll.
 * The fixture class owns its OWN templates, so "changing the live configuration"
 * here cannot disturb any other class's card. Nothing shared is modified — in
 * particular the school's `report_card_settings` row is read but never written
 * (display toggles are covered by the unit test instead).
 *
 * It also asserts the AUDIT TRAIL, because the retraction workflow is only as good as
 * its record: publish/retract/republish must each leave a row in
 * `report_card_audit_logs`, and the School Admin's investigation view must show them
 * with the actor and the reason. Those rows only started existing with migration 056 —
 * the table was declared in 017 and had never been created in this database.
 *
 * OPT-IN, because it writes to staging:
 *
 *     CBT_LIVE=1 npx vitest run src/lib/__tests__/live-report-card-snapshot.test.ts
 */

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "schoolaid-session" && h.cookie ? { name, value: h.cookie } : undefined,
  }),
}));

const REPO = path.join(__dirname, "..", "..", "..");

/** Same twelve lines as `src/lib/cbt/__tests__/routes.test.ts`. Not extracted on
 *  purpose: extraction means editing a file of 24 live tests in the same commit as a
 *  new fixture harness, and a broken live suite is worse than a duplicated reader. */
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

// The modules under test read process.env directly, so holding these in this file
// would leave the real client unconfigured while every assertion passed.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= SERVICE_KEY;
process.env.JWT_SECRET ||= JWT_SECRET;

const RUN = process.env.CBT_LIVE === "1";
const IS_STAGING = REF === "noyegdgrfzopfrwjunot";

const PREFIX = "P11 PROBE";
const EMAIL_PREFIX = "p11-probe";

async function sessionCookie(claims: { sub: string; role: string; school_id: string }) {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

type Fx = {
  schoolId: string;
  termId: string;
  subjectId: string;
  adminProfileId: string;
  classId: string;
  students: { id: string; profileId: string; label: string }[];
  componentIds: string[];
  templateIds: string[];
  /** GoTrue users created for the fixture. A profile cannot exist without one:
   *  `profiles.id` references `auth.users.id`. */
  authUserIds: string[];
  snapshotFromPublish: SnapshotShape | null;
  card: Record<string, unknown> | null;
};

/** The shape 055's CHECK guards allow, narrowed enough to assert against. */
type SnapshotShape = {
  captured_at: string;
  assessment_components: { component_id: string; name: string; display_order: number; maximum_score: number }[];
  grading_scale: { grade: string; minimum_score: number; maximum_score: number }[];
  psychomotor_traits: { trait_id: string; name: string }[];
  affective_traits: { trait_id: string; name: string }[];
  position: Record<string, number>;
  class_size: number;
};

type HistoryEntry = { cycle_id: string | null; retired_at: string; snapshot: SnapshotShape };

const F: Fx = {
  schoolId: "",
  termId: "",
  subjectId: "",
  adminProfileId: "",
  classId: "",
  students: [],
  componentIds: [],
  templateIds: [],
  authUserIds: [],
  snapshotFromPublish: null,
  card: null,
};

describe.skipIf(!RUN)("Phase 11 — a published card survives a live-configuration change", () => {
  let service: SupabaseClient;

  const review = async (body: Record<string, unknown>) => {
    h.cookie = await sessionCookie({ sub: F.adminProfileId, role: "school_admin", school_id: F.schoolId });
    const res = await reviewPOST(
      new Request("http://localhost/api/school-admin/report-card-review/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ classId: F.classId }) },
    );
    return { status: res.status, body: await res.json() };
  };

  const getCard = async () => {
    h.cookie = await sessionCookie({
      sub: F.students[0].profileId, role: "student", school_id: F.schoolId,
    });
    const res = await studentCardGET(new Request("http://localhost/api/student/report-card/probe"), {
      params: Promise.resolve({ termId: F.termId }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, unknown>;
  };

  const readSubmission = async () => {
    const { data } = await service
      .from("report_card_submissions")
      .select("status, configuration_snapshot, publication_history, correction_cycle_id, published_at, published_by")
      .eq("class_id", F.classId)
      .eq("term_id", F.termId)
      .maybeSingle();
    return data as Record<string, unknown> | null;
  };

  const auditRows = async () => {
    const { data, error } = await service
      .from("report_card_audit_logs")
      .select("action, details, user_id")
      .eq("class_id", F.classId)
      .eq("term_id", F.termId)
      .order("created_at", { ascending: true });
    expect(error?.message, "report_card_audit_logs must exist (migration 056)").toBeUndefined();
    return (data ?? []) as { action: string; details: Record<string, unknown> | null; user_id: string }[];
  };

  /** Best-effort delete: a failed cleanup must not hide a failed assertion. */
  const del = async (label: string, q: PromiseLike<{ error: unknown }>) => {
    const { error } = await q;
    if (error) console.error(`[p11 cleanup] ${label}:`, (error as { message?: string }).message);
  };

  const cleanup = async () => {
    const studentIds = F.students.map((s) => s.id);
    const profileIds = F.students.map((s) => s.profileId);

    if (F.classId) {
      await del("report_card_audit_logs", service.from("report_card_audit_logs").delete().eq("class_id", F.classId));
      await del("report_card_submissions", service.from("report_card_submissions").delete().eq("class_id", F.classId));
      for (const t of ["class_components_templates", "class_grading_templates", "class_psychomotor_templates", "class_affective_templates"]) {
        await del(t, service.from(t).delete().eq("class_id", F.classId));
      }
      await del("class_subjects", service.from("class_subjects").delete().eq("class_id", F.classId));
    }
    if (studentIds.length) {
      await del("result_edit_logs", service.from("result_edit_logs").delete().in("student_id", studentIds));
      await del("term_result_components", service.from("term_result_components").delete().in("student_id", studentIds));
      await del("term_results", service.from("term_results").delete().in("student_id", studentIds));
      await del("school_admin_comments", service.from("school_admin_comments").delete().in("student_id", studentIds));
      await del("student_scores", service.from("student_scores").delete().in("student_id", studentIds));
      await del("students", service.from("students").delete().in("id", studentIds));
    }
    // Templates before the rows they own is unnecessary (ON DELETE CASCADE), but the
    // rows are deleted explicitly so a template that failed to link still goes.
    for (const t of ["components_rows", "grading_rows", "psychomotor_rows", "affective_rows"]) {
      if (F.templateIds.length) await del(t, service.from(t).delete().in("template_id", F.templateIds));
    }
    for (const t of ["components_templates", "grading_templates", "psychomotor_templates", "affective_templates"]) {
      if (F.templateIds.length) await del(t, service.from(t).delete().in("id", F.templateIds));
    }
    if (F.adminProfileId) await del("admin profile", service.from("profiles").delete().eq("id", F.adminProfileId));
    if (profileIds.length) await del("student profiles", service.from("profiles").delete().in("id", profileIds));
    if (F.classId) await del("class", service.from("classes").delete().eq("id", F.classId));
    // The GoTrue users last: profiles are the only thing that references them.
    for (const id of F.authUserIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error(`[p11 cleanup] auth user ${id}:`, error.message);
    }
  };

  /** Create the auth user first, exactly as the app's provisioning routes do, and use
   *  its id for the profile: `profiles.id` references `auth.users.id` ON DELETE CASCADE,
   *  so the profile cannot exist without one — and the `on_auth_user_created` trigger
   *  creates the profile row itself, reading `role` from the user metadata. Only
   *  `school_id` is left for us to set. Deleted in `afterAll`. */
  const createUser = async (email: string, fullName: string, role: string) => {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    expect(error?.message, `auth user ${email}`).toBeUndefined();
    const id = data?.user?.id as string;
    F.authUserIds.push(id);

    const { error: pErr } = await service
      .from("profiles")
      .update({ school_id: F.schoolId, full_name: fullName, role })
      .eq("id", id);
    expect(pErr?.message, `profile ${email}`).toBeUndefined();

    const { data: profile } = await service
      .from("profiles").select("id, role, school_id").eq("id", id).maybeSingle();
    expect(profile, `profile for ${email} (created by the on_auth_user_created trigger)`).toBeTruthy();
    expect(profile?.role).toBe(role);
    expect(profile?.school_id).toBe(F.schoolId);
    return id;
  };

  beforeAll(async () => {
    expect(IS_STAGING, `refusing to run against '${REF}' — staging only`).toBe(true);
    expect(JWT_SECRET, "JWT_SECRET is required to mint a session").not.toBe("");
    expect(SERVICE_KEY).not.toBe("");

    service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Leftovers from a crashed run, before anything else looks at the school ──
    const staleStudents = await service.from("students").select("id, profile_id").like("student_id", "P11PROBE%");
    if (staleStudents.data?.length) {
      const staleProfileIds = staleStudents.data.map((s) => s.profile_id as string);
      const ids = staleStudents.data.map((s) => s.id as string);
      await del("stale scores", service.from("student_scores").delete().in("student_id", ids));
      await del("stale students", service.from("students").delete().in("id", ids));
      await del("stale student profiles", service.from("profiles").delete().in("id", staleProfileIds));
    }
    await del("stale admin profile", service.from("profiles").delete().like("email", `${EMAIL_PREFIX}-%@example.invalid`));
    for (const t of ["components_templates", "grading_templates", "psychomotor_templates", "affective_templates"]) {
      await del(`stale ${t}`, service.from(t).delete().like("name", `${PREFIX}%`));
    }
    await del("stale classes", service.from("classes").delete().like("name", `${PREFIX}%`));
    // Profiles first (the FK has no cascade), then the GoTrue users themselves.
    const { data: userPage } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of userPage?.users ?? []) {
      if ((u.email ?? "").startsWith(EMAIL_PREFIX)) {
        console.log(`[p11 cleanup] leftover auth user ${u.email}`);
        await service.auth.admin.deleteUser(u.id);
      }
    }

    // ── Pick the school that already has report-card data, its active term, a subject ──
    const { data: published } = await service
      .from("report_card_submissions")
      .select("school_id")
      .eq("status", "published")
      .limit(1)
      .maybeSingle();
    F.schoolId = published!.school_id as string;

    const { data: term } = await service
      .from("academic_terms")
      .select("id")
      .eq("school_id", F.schoolId)
      .eq("is_active", true)
      .maybeSingle();
    F.termId = term!.id as string;

    const { data: subject } = await service
      .from("subjects")
      .select("id")
      .eq("school_id", F.schoolId)
      .limit(1)
      .maybeSingle();
    F.subjectId = subject!.id as string;

    // ── A School Admin identity to hold the session. `published_by` is a real FK to
    //    profiles, so a made-up uuid would fail the publish itself. ──
    F.adminProfileId = await createUser(
      `${EMAIL_PREFIX}-admin-${Date.now()}@example.invalid`, `${PREFIX} ADMIN`, "school_admin",
    );

    // ── The class under test ──
    F.classId = randomUUID();
    const { error: classError } = await service.from("classes").insert({
      id: F.classId, school_id: F.schoolId, name: `${PREFIX} CLASS ${Date.now()}`,
    });
    expect(classError?.message).toBeUndefined();

    const { error: csError } = await service.from("class_subjects").insert({
      id: randomUUID(), school_id: F.schoolId, class_id: F.classId, subject_id: F.subjectId, is_active: true,
    });
    expect(csError?.message).toBeUndefined();

    // ── The fixture's OWN templates: this is what makes "changing live
    //    configuration" safe to do inside a shared staging school. ──
    const mkTemplate = async (linkTable: string, templateTable: string, rowsTable: string, rows: Record<string, unknown>[]) => {
      const templateId = randomUUID();
      const { error: tErr } = await service.from(templateTable).insert({ id: templateId, school_id: F.schoolId, name: `${PREFIX} ${templateTable}` });
      // Every insert is checked: a silently empty template would turn this suite into a
      // test of nothing, and the ids have no database default to fall back on.
      expect(tErr?.message, templateTable).toBeUndefined();
      const { error: rErr } = await service.from(rowsTable).insert(rows.map((r) => ({ id: randomUUID(), ...r, template_id: templateId })));
      expect(rErr?.message, rowsTable).toBeUndefined();
      const { error: lErr } = await service.from(linkTable).insert({
        id: randomUUID(), school_id: F.schoolId, class_id: F.classId, template_id: templateId,
      });
      expect(lErr?.message, linkTable).toBeUndefined();
      F.templateIds.push(templateId);
      return templateId;
    };

    const ca1 = randomUUID();
    const exam = randomUUID();
    F.componentIds = [ca1, exam];
    await mkTemplate("class_components_templates", "components_templates", "components_rows", [
      { id: ca1, name: `${PREFIX} CA1`, maximum_score: 20, display_order: 1 },
      { id: exam, name: `${PREFIX} EXAM`, maximum_score: 80, display_order: 2 },
    ]);

    await mkTemplate("class_grading_templates", "grading_templates", "grading_rows", [
      { grade: "A", minimum_score: 70, maximum_score: 100, remark: "excellent", principal_remark: "{name} had {average}% ({grade})" },
      { grade: "B", minimum_score: 60, maximum_score: 69, remark: "very good", principal_remark: null },
      { grade: "C", minimum_score: 50, maximum_score: 59, remark: "good", principal_remark: null },
      { grade: "F", minimum_score: 0, maximum_score: 49, remark: "poor", principal_remark: null },
    ]);

    await mkTemplate("class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows", [
      { name: `${PREFIX} PUNCTUALITY`, display_order: 1 },
    ]);
    await mkTemplate("class_affective_templates", "affective_templates", "affective_rows", [
      { name: `${PREFIX} POLITENESS`, display_order: 1 },
    ]);

    // ── Two students, so the card has a position to freeze ──
    for (const [i, scores] of [[0, [15, 55]], [1, [5, 40]]] as [number, number[]][]) {
      const profileId = await createUser(
        `${EMAIL_PREFIX}-s${i + 1}-${Date.now()}@example.invalid`, `${PREFIX} STUDENT ${i + 1}`, "student",
      );
      const studentId = randomUUID();

      const { error: sErr } = await service.from("students").insert({
        id: studentId, school_id: F.schoolId, profile_id: profileId, class_id: F.classId,
        student_id: `P11PROBE${i + 1}`, status: "active", must_change_password: false,
        is_profile_completed: true, is_active: true,
      });
      expect(sErr?.message).toBeUndefined();

      await service.from("student_scores").insert([
        { id: randomUUID(), school_id: F.schoolId, student_id: studentId, class_id: F.classId, subject_id: F.subjectId, term_id: F.termId, component_id: ca1, score: scores[0] },
        { id: randomUUID(), school_id: F.schoolId, student_id: studentId, class_id: F.classId, subject_id: F.subjectId, term_id: F.termId, component_id: exam, score: scores[1] },
      ]);

      F.students.push({ id: studentId, profileId, label: `student ${i + 1}` });
    }

    // ── The class is submitted and waiting for approval ──
    await service.from("report_card_submissions").insert({
      id: randomUUID(), school_id: F.schoolId, class_id: F.classId, term_id: F.termId,
      status: "pending_approval", submitted_by: F.adminProfileId, submitted_at: new Date().toISOString(),
    });
  }, 120_000);

  afterAll(async () => {
    if (!RUN || !service) return;
    await cleanup();
  }, 120_000);

  it("approve freezes the configuration the card renders with", async () => {
    const { status, body } = await review({ action: "approve" });
    expect(body).toEqual({ success: true, status: "published" });
    expect(status).toBe(200);

    const submission = await readSubmission();
    expect(submission?.status).toBe("published");

    const snapshot = submission?.configuration_snapshot as SnapshotShape;
    expect(snapshot, "approve must WRITE a snapshot").toBeTruthy();

    expect(snapshot.assessment_components).toEqual([
      { component_id: F.componentIds[0], name: `${PREFIX} CA1`, display_order: 1, maximum_score: 20 },
      { component_id: F.componentIds[1], name: `${PREFIX} EXAM`, display_order: 2, maximum_score: 80 },
    ]);
    expect(snapshot.grading_scale.find((g) => g.grade === "A")).toMatchObject({ minimum_score: 70, maximum_score: 100 });
    expect(snapshot.psychomotor_traits).toHaveLength(1);
    expect(snapshot.psychomotor_traits[0].name).toBe(`${PREFIX} PUNCTUALITY`);
    expect(snapshot.affective_traits[0].name).toBe(`${PREFIX} POLITENESS`);

    // Roster size is the class size even though only the students who have results are
    // ranked — "1st of 2", not "1st of 1".
    expect(snapshot.class_size).toBe(2);
    expect(snapshot.position).toEqual({ [F.students[0].id]: 1, [F.students[1].id]: 2 });

    // No previous publication to retire on a first publish.
    expect(submission?.publication_history).toBeNull();

    // The freeze is recorded, not just applied.
    const audit = await auditRows();
    expect(audit.map((r) => r.action)).toContain("approve");
    expect(audit.every((r) => r.user_id === F.adminProfileId)).toBe(true);

    F.snapshotFromPublish = snapshot;
  }, 60_000);

  it("renders the published card from the snapshot", async () => {
    const card = await getCard();
    F.card = card;

    expect((card.components as { name: string }[]).map((c) => c.name)).toEqual([`${PREFIX} CA1`, `${PREFIX} EXAM`]);
    expect(card.position).toBe(1);
    expect(card.totalStudents).toBe(2);
    expect(card.grading_scales).toHaveLength(4);
    expect((card.psychomotor as { name: string }[])[0].name).toBe(`${PREFIX} PUNCTUALITY`);
    expect((card.affective as { name: string }[])[0].name).toBe(`${PREFIX} POLITENESS`);
    // Grade A (70%) with the fixture's principal-remark template, as stored at publish.
    expect((card.results as { grade: string }[])[0].grade).toBe("A");
    expect(String(card.admin_comment)).toContain("70.0%");
    expect(card.has_results).toBe(true);
  }, 60_000);

  it("THE ACCEPTANCE TEST: changing every part of the live configuration changes nothing", async () => {
    const before = F.card;
    expect(before, "previous test must have rendered the card").toBeTruthy();

    // Exactly the spec's post-publication edits, on the fixture's OWN templates.
    const { error: e1 } = await service.from("components_rows")
      .update({ name: "RENAMED CA1" }).eq("id", F.componentIds[0]);
    expect(e1?.message).toBeUndefined();

    const { error: e2 } = await service.from("grading_rows")
      .update({ minimum_score: 95, remark: "RENAMED REMARK", principal_remark: "RENAMED PRINCIPAL REMARK" })
      .eq("template_id", F.templateIds[1]).eq("grade", "A");
    expect(e2?.message).toBeUndefined();

    const { error: e3 } = await service.from("psychomotor_rows")
      .update({ name: "RENAMED PUNCTUALITY" }).eq("template_id", F.templateIds[2]);
    expect(e3?.message).toBeUndefined();

    const { error: e4 } = await service.from("affective_rows")
      .update({ name: "RENAMED POLITENESS" }).eq("template_id", F.templateIds[3]);
    expect(e4?.message).toBeUndefined();

    const after = await getCard();
    // The whole body, field for field. If live configuration leaked into any part of
    // the card, this is where it shows.
    expect(after).toEqual(before);
  }, 60_000);

  it("a card published before snapshots existed still renders from live configuration", async () => {
    // The legacy state: NULL snapshot, which is what every already-published card on
    // staging has. Documented behaviour is "render it the old way" — proven, not assumed.
    const { error } = await service.from("report_card_submissions")
      .update({ configuration_snapshot: null }).eq("class_id", F.classId).eq("term_id", F.termId);
    expect(error?.message).toBeUndefined();

    const legacy = await getCard();
    expect((legacy.components as { name: string }[])[0].name).toBe("RENAMED CA1");
    expect((legacy.psychomotor as { name: string }[])[0].name).toBe("RENAMED PUNCTUALITY");
    expect(legacy.admin_comment).not.toBe(F.card?.admin_comment);
    expect(legacy).not.toEqual(F.card);

    // Restore, and confirm the frozen card is back.
    const { error: restoreError } = await service.from("report_card_submissions")
      .update({ configuration_snapshot: F.snapshotFromPublish }).eq("class_id", F.classId).eq("term_id", F.termId);
    expect(restoreError?.message).toBeUndefined();
    expect(await getCard()).toEqual(F.card);
  }, 60_000);

  it("retract leaves the publication untouched, and republish retires it into history", async () => {
    const retracted = await review({ action: "retract", retraction_reason: "Phase 11 live test — no score was changed." });
    expect(retracted.body).toEqual({ success: true, status: "retracted", correction_cycle_id: expect.any(String) });

    // A retraction hides the card; it does not rewrite the record of what was published.
    const afterRetract = await readSubmission();
    expect(afterRetract?.status).toBe("retracted");
    expect(afterRetract?.configuration_snapshot).toEqual(F.snapshotFromPublish);
    expect(afterRetract?.publication_history).toBeNull();

    // ...and the reason and the cycle that authorized it are recorded.
    const retractRow = (await auditRows()).find((r) => r.action === "retract");
    expect(retractRow?.details?.reason).toBe("Phase 11 live test — no score was changed.");
    expect(retractRow?.details?.correction_cycle_id).toBe(retracted.body.correction_cycle_id);

    // Students must not see a retracted card as published.
    const hidden = await getCard();
    expect(hidden.has_results).toBe(false);
    expect(hidden.is_retracted).toBe(true);

    const republished = await review({ action: "republish" });
    expect(republished.body).toEqual({ success: true, status: "published" });

    const afterRepublish = await readSubmission();
    const history = afterRepublish?.publication_history as HistoryEntry[];
    expect(history, "the previous publication must survive as history").toHaveLength(1);
    expect(history[0].snapshot).toEqual(F.snapshotFromPublish);
    expect(history[0].cycle_id).toBe(retracted.body.correction_cycle_id);
    expect(history[0].retired_at).toBeTruthy();

    // V2 is the configuration as it stands NOW (the renamed live config), which is the
    // agreed Option B: republishing opens a new publication state rather than rewriting
    // the old one.
    const v2 = afterRepublish?.configuration_snapshot as SnapshotShape;
    expect(v2.captured_at).not.toBe(F.snapshotFromPublish?.captured_at);
    expect(v2.assessment_components[0].name).toBe("RENAMED CA1");
    expect(history[0].snapshot.assessment_components[0].name).toBe(`${PREFIX} CA1`);

    // Recorded, NOT endorsed — Contradiction C (register I19): republish does not
    // recompute, so the frozen grade letter still reflects the ORIGINAL bands while the
    // grading key now comes from V2. Corrected results go through re-submit -> approve.
    const card = await getCard();
    expect((card.results as { grade: string }[])[0].grade).toBe("A");
    expect(card.grading_scales).toEqual(expect.arrayContaining([expect.objectContaining({ grade: "A", minimum_score: 95 })]));

    // The School Admin's investigation view: who did what, when, and why. This is the
    // screen the retraction workflow exists to feed.
    const audit = await auditRows();
    expect(audit.map((r) => r.action)).toEqual(expect.arrayContaining(["approve", "retract", "republish"]));

    h.cookie = await sessionCookie({ sub: F.adminProfileId, role: "school_admin", school_id: F.schoolId });
    const logsRes = await reviewLogsGET(
      new Request("http://localhost/api/school-admin/report-card-review/probe/logs"),
      { params: Promise.resolve({ classId: F.classId }) },
    );
    expect(logsRes.status).toBe(200);
    const { timeline } = (await logsRes.json()) as {
      timeline: { action: string; user: string; detail: string }[];
    };
    const actions = timeline.map((t) => t.action);
    expect(actions).toEqual(expect.arrayContaining(["approve", "retract", "republish"]));
    const retractEvent = timeline.find((t) => t.action === "retract");
    expect(retractEvent?.detail).toContain("Phase 11 live test");
    expect(retractEvent?.user).toBe(`${PREFIX} ADMIN`);
  }, 120_000);
});
