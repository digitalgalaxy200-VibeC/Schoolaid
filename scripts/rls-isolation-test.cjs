#!/usr/bin/env node
/**
 * RLS tenant-isolation regression test.
 *
 * Complements `scripts/isolation-test.cjs` (which exercises the HTTP surface
 * through the service-role routes). This script proves the DATABASE layer
 * directly by emulating exactly what PostgREST does for a tenant request:
 *
 *     set local role authenticated;
 *     set local request.jwt.claims = '{"sub":..., "role":"authenticated", "school_id":"..."}';
 *
 * and then asserting that Row Level Security filters rows to that one tenant.
 *
 * This is the check that surfaces the tables which have RLS enabled but no
 * policies at all (deny-all to tenants) — a state invisible from the HTTP layer,
 * because every route uses the service-role client, which bypasses RLS.
 *
 * Most tenant statements run inside a transaction that is rolled back. The CBT
 * section (§6) inserts a probe question inside such a transaction so it can be
 * read back as each role — the rollback leaves no row behind.
 *
 * Usage:
 *     npm run test:rls
 *
 * Connection comes from STAGING_DB_URL (or DATABASE_URL), falling back to the
 * repo's gitignored .env.staging. Credentials are never hard-coded here.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const REPO = path.join(__dirname, "..");

/**
 * Tables where BOTH tenants are expected to hold at least one row. Used for the
 * cross-tenant assertions so the test cannot pass vacuously.
 */
const TWO_SIDED_TABLES = ["profiles", "support_logs"];

/**
 * Tables a tenant may legitimately read its own rows from. `support_logs` is
 * deliberately excluded: its SELECT policy is `is_super_admin()`, so support /
 * impersonation records are platform-level and not tenant-readable by design.
 * It is still used for cross-tenant blocking checks below.
 */
const TENANT_READABLE_TABLES = ["profiles"];

/**
 * Highest number of TENANT-SCOPED tables (those carrying `school_id`) allowed to
 * have RLS enabled with zero policies.
 *
 * Now ZERO. Migration 043 added tenant policies to all 28 that were previously
 * unprotected, so any regression here means a newly added table shipped without
 * policies — which would silently return nothing to a tenant-scoped client.
 *
 * Tables without `school_id` (e.g. `password_history`, `super_admins`) are
 * excluded: they are not tenant data and are intentionally service-role-only.
 */
const MAX_TENANT_POLICYLESS_TABLES = 0;

function loadConnection() {
  if (process.env.STAGING_DB_URL) return process.env.STAGING_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(REPO, ".env.staging");
  if (!fs.existsSync(envPath)) {
    console.error("No STAGING_DB_URL and no .env.staging found.");
    process.exit(2);
  }
  const match = fs.readFileSync(envPath, "utf8").match(/^STAGING_DB_URL=(.*)$/m);
  if (!match) {
    console.error("STAGING_DB_URL is not present in .env.staging.");
    process.exit(2);
  }
  return match[1].trim();
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}
function note(text) {
  console.log(`  [NOTE] ${text}`);
}

async function count(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Number(rows[0].count);
}

/** Runs `fn` with the connection impersonating one tenant, then rolls back. */
async function asTenant(client, schoolId, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    if (schoolId) {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000001",
          role: "authenticated",
          school_id: schoolId,
        }),
      ]);
    }
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

/** Runs `fn` as a platform Super Admin, then rolls back. */
async function asSuperAdmin(client, schoolId, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000002",
        role: "super_admin",
        school_id: schoolId,
      }),
    ]);
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

/**
 * Runs `fn` as ONE app_role inside one tenant, then rolls back.
 *
 * `asTenant` carries no `app_role` — that is the shape of a generic
 * authenticated request. This helper exists for the checks that must tell roles
 * apart: a teacher writing marks, and a student trying to.
 */
async function asActor(client, { schoolId, appRole, sub = "00000000-0000-0000-0000-000000000003" }, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    const claims = { sub, role: "authenticated", school_id: schoolId };
    if (appRole) claims.app_role = appRole;
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main() {
  const client = new Client({ connectionString: loadConnection() });
  await client.connect();

  try {
    const { rows: schools } = await client.query(
      "SELECT id, name FROM public.schools ORDER BY created_at LIMIT 2",
    );
    if (schools.length < 2) {
      console.error("Need at least two schools on this database to test isolation.");
      process.exit(2);
    }
    const [a, b] = schools;
    console.log(`Tenant A: ${a.name} (${a.id.slice(0, 8)}…)`);
    console.log(`Tenant B: ${b.name} (${b.id.slice(0, 8)}…)\n`);

    // Ground truth read as the table owner (RLS bypassed).
    const truth = {};
    for (const t of TWO_SIDED_TABLES) {
      truth[t] = {
        a: await count(client, `SELECT count(*) FROM public.${t} WHERE school_id = $1`, [a.id]),
        b: await count(client, `SELECT count(*) FROM public.${t} WHERE school_id = $1`, [b.id]),
      };
    }

    console.log("0. Preconditions — the test must not be vacuous");
    for (const t of TWO_SIDED_TABLES) {
      check(
        `both tenants hold rows in "${t}"`,
        truth[t].a > 0 && truth[t].b > 0,
        `A=${truth[t].a}, B=${truth[t].b}`,
      );
    }
    if (results.some((r) => !r.passed)) {
      console.log("\nAborting: cross-tenant checks would be vacuous.");
      process.exit(2);
    }

    console.log("\n1. A tenant reads exactly its own rows");
    for (const t of TENANT_READABLE_TABLES) {
      const seen = await asTenant(client, a.id, () => count(client, `SELECT count(*) FROM public.${t}`));
      check(`A sees exactly its own "${t}"`, seen === truth[t].a, `saw ${seen}, expected ${truth[t].a}`);
      const seenB = await asTenant(client, b.id, () => count(client, `SELECT count(*) FROM public.${t}`));
      check(`B sees exactly its own "${t}"`, seenB === truth[t].b, `saw ${seenB}, expected ${truth[t].b}`);
    }
    note("support_logs is intentionally super-admin-only; covered by the checks below and in 2b");

    console.log("\n2. A tenant cannot reach another tenant's rows");
    for (const t of TWO_SIDED_TABLES) {
      const aSeeingB = await asTenant(client, a.id, () =>
        count(client, `SELECT count(*) FROM public.${t} WHERE school_id = $1`, [b.id]),
      );
      check(`A cannot select B's "${t}"`, aSeeingB === 0, `saw ${aSeeingB}, expected 0`);

      const bSeeingA = await asTenant(client, b.id, () =>
        count(client, `SELECT count(*) FROM public.${t} WHERE school_id = $1`, [a.id]),
      );
      check(`B cannot select A's "${t}"`, bSeeingA === 0, `saw ${bSeeingA}, expected 0`);
    }

    console.log("\n2b. A Super Admin can still read platform-level records");
    const superSeen = await asSuperAdmin(client, a.id, () =>
      count(client, "SELECT count(*) FROM public.support_logs WHERE school_id = $1", [a.id]),
    );
    check(
      "super admin sees support_logs for a school",
      superSeen === truth.support_logs.a,
      `saw ${superSeen}, expected ${truth.support_logs.a}`,
    );

    console.log("\n3. A request with no tenant claim is denied");
    for (const t of TWO_SIDED_TABLES) {
      const none = await asTenant(client, null, () => count(client, `SELECT count(*) FROM public.${t}`));
      check(`no claims sees zero "${t}"`, none === 0, `saw ${none}, expected 0`);
    }

    console.log("\n4. RLS coverage ratchet (tenant-scoped tables only)");
    const { rows: policylessRows } = await client.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname
            AND col.column_name = 'school_id')
        AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname)
      ORDER BY 1
    `);
    const policyless = policylessRows.map((r) => r.relname);
    check(
      `tenant-scoped tables with RLS but no policies has not grown ` +
        `(<= ${MAX_TENANT_POLICYLESS_TABLES})`,
      policyless.length <= MAX_TENANT_POLICYLESS_TABLES,
      `${policyless.length} found`,
    );

    const { rows: nonTenantRows } = await client.query(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname
            AND col.column_name = 'school_id')
        AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname)
      ORDER BY 1
    `);
    note(
      `${nonTenantRows.length} non-tenant tables are intentionally service-role-only ` +
        `(no school_id): ${nonTenantRows.map((r) => r.relname).join(", ")}`,
    );

    console.log("\n4b. Academically critical tables that are deny-all to tenants");
    const criticalGap = policyless.filter((t) =>
      /score|result|attendance|comment|submission|trait/.test(t),
    );
    if (criticalGap.length) {
      note(`${criticalGap.length} found: ${criticalGap.join(", ")}`);
      note("These must gain real policies before any tenant-scoped client reads them.");
    }

    console.log("\n5. Every cbt_* table must have RLS and at least one policy");
    const { rows: cbtRows } = await client.query(`
      SELECT c.relname, c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'cbt\\_%'
      ORDER BY 1
    `);
    if (cbtRows.length === 0) {
      note('no cbt_* tables yet — expected before Phase 14, gate passes trivially');
    } else {
      for (const r of cbtRows) {
        check(
          `cbt table "${r.relname}" has RLS and policies`,
          r.rls === true && Number(r.policies) > 0,
          `rls=${r.rls} policies=${r.policies}`,
        );
      }
    }

    console.log("\n6. CBT content is staff-only (answer keys must not leak)");
    if (cbtRows.length === 0) {
      note("no cbt_* tables on this database — nothing to check");
    } else {
      // Find subjects wherever they actually exist. Using tenant A's id blindly
      // would silently skip these checks on a database where tenant A has no
      // staff or students — a vacuous pass.
      const pickRow = async (sql, params = []) => (await client.query(sql, params)).rows[0];

      const staff = await pickRow(
        `SELECT t.school_id, p.id FROM profiles p
           JOIN teachers t ON t.profile_id = p.id ORDER BY t.school_id LIMIT 1`,
      );
      const student = await pickRow(
        `SELECT s.school_id, p.id FROM profiles p
           JOIN students s ON s.profile_id = p.id ORDER BY s.school_id LIMIT 1`,
      );
      const otherStudent = student
        ? await pickRow(
            `SELECT s.school_id, p.id FROM profiles p
               JOIN students s ON s.profile_id = p.id
              WHERE s.school_id <> $1 LIMIT 1`,
            [student.school_id],
          )
        : null;

      if (!student) {
        note("no student accounts on this database — CBT leak checks skipped");
      } else {
        const probe = "RLS PROBE " + crypto.randomUUID();
        await client.query("BEGIN");
        try {
          // Written as the table owner (RLS bypassed), then read back per role.
          await client.query(
            `INSERT INTO public.cbt_questions (school_id, question_type, question_text, marks)
             VALUES ($1, 'mcq', $2, 1)`,
            [student.school_id, probe],
          );
          await client.query(
            `INSERT INTO public.cbt_question_answer_keys (question_id, school_id, model_answer)
             SELECT id, school_id, 'probe-key' FROM public.cbt_questions WHERE question_text = $1`,
            [probe],
          );

          // THE line that matters: without it we would be querying as the owner,
          // which bypasses RLS and makes every assertion below pass vacuously.
          await client.query("SET LOCAL ROLE authenticated");

          const readAs = async (role, schoolId, sub) => {
            await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub, role: "authenticated", app_role: role, school_id: schoolId }),
            ]);
            const r = await client.query(
              `SELECT
                 (SELECT count(*) FROM public.cbt_questions WHERE question_text = $1) AS questions,
                 (SELECT count(*) FROM public.cbt_question_answer_keys) AS keys`,
              [probe],
            );
            return { questions: Number(r.rows[0].questions), keys: Number(r.rows[0].keys) };
          };

          if (staff) {
            const r = await readAs("teacher", staff.school_id, staff.id);
            check("a teacher can read the question bank", r.questions === 1, `saw ${r.questions}`);
            check("a teacher can read answer keys", r.keys === 1, `saw ${r.keys}`);
          } else {
            note("no teacher accounts on this database — staff read checks skipped");
          }

          const r = await readAs("student", student.school_id, student.id);
          check("a student CANNOT read the question bank", r.questions === 0, `saw ${r.questions}`);
          check("a student CANNOT read answer keys", r.keys === 0, `saw ${r.keys}`);

          if (otherStudent) {
            const r2 = await readAs("student", otherStudent.school_id, otherStudent.id);
            check(
              "another school's student sees no questions",
              r2.questions === 0,
              `saw ${r2.questions}`,
            );
          } else {
            note("only one school has students — the other-school check below still runs");
          }

          // Non-vacuous cross-tenant check that needs no second-school student: a
          // token claiming a DIFFERENT school must not see tenant A's question bank.
          // This proves the policy keys off `school_id` and not merely off `sub`.
          const foreignSchoolId = student.school_id === a.id ? b.id : a.id;
          check(
            "cross-school CBT probe has a genuinely foreign school id",
            foreignSchoolId !== student.school_id,
            foreignSchoolId === student.school_id ? "same id" : "ok",
          );
          const r3 = await readAs("teacher", foreignSchoolId, staff ? staff.id : student.id);
          check(
            "a token claiming another school sees no questions",
            r3.questions === 0,
            `saw ${r3.questions}`,
          );
        } finally {
          await client.query("ROLLBACK");
        }
      }
    }

    console.log("\n7. Attempt integrity: server-owned timing, immutable snapshots");
    if (cbtRows.length === 0) {
      note("no cbt_* tables on this database — nothing to check");
    } else {
      const subject = await client.query(
        `SELECT s.school_id, s.id AS student_id, s.profile_id, s.class_id
           FROM students s
          WHERE s.profile_id IS NOT NULL AND s.class_id IS NOT NULL
          LIMIT 1`,
      );
      const sub = subject.rows[0];

      if (!sub) {
        note("no student with a class on this database — attempt checks skipped");
      } else {
        await client.query("BEGIN");
        try {
          // Build a minimal attempt as the owner (RLS bypassed).
          const asm = await client.query(
            `INSERT INTO public.cbt_assessments (school_id, class_id, title, status)
             VALUES ($1, $2, $3, 'published') RETURNING id`,
            [sub.school_id, sub.class_id, "RLS ATTEMPT PROBE"],
          );
          const assessmentId = asm.rows[0].id;

          const att = await client.query(
            `INSERT INTO public.cbt_attempts
               (school_id, assessment_id, student_id, student_profile_id, attempt_number, started_at)
             VALUES ($1, $2, $3, $4, 1, NOW() - INTERVAL '2 hours') RETURNING id`,
            [sub.school_id, assessmentId, sub.student_id, sub.profile_id],
          );
          const attemptId = att.rows[0].id;
          const aq = await client.query(
            `INSERT INTO public.cbt_attempt_questions
               (school_id, attempt_id, student_profile_id, display_order, question_type, question_text, marks)
             VALUES ($1, $2, $3, 0, 'mcq', 'PROBE SNAPSHOT', 1) RETURNING id`,
            [sub.school_id, attemptId, sub.profile_id],
          );

          // Switch to the student and try to tamper with their own attempt.
          await client.query("SET LOCAL ROLE authenticated");
          await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({
              sub: sub.profile_id,
              role: "authenticated",
              app_role: "student",
              school_id: sub.school_id,
            }),
          ]);

          const sel = await client.query(
            `SELECT count(*) AS n FROM public.cbt_attempts WHERE id = $1`,
            [attemptId],
          );
          check("a student can read their own attempt", Number(sel.rows[0].n) === 1, `saw ${sel.rows[0].n}`);

          const upd = await client.query(
            `UPDATE public.cbt_attempts SET started_at = NOW(), expires_at = NOW() + INTERVAL '10 years'
              WHERE id = $1`,
            [attemptId],
          );
          check(
            "a student CANNOT rewrite their own attempt timing",
            upd.rowCount === 0,
            `updated ${upd.rowCount} row(s)`,
          );

          const del = await client.query(`DELETE FROM public.cbt_attempts WHERE id = $1`, [attemptId]);
          check("a student CANNOT delete their own attempt", del.rowCount === 0, `deleted ${del.rowCount}`);

          const shUpd = await client.query(
            `UPDATE public.cbt_attempt_questions SET question_text = 'TAMPERED' WHERE id = $1`,
            [aq.rows[0].id],
          );
          check(
            "a student CANNOT edit the question snapshot",
            shUpd.rowCount === 0,
            `updated ${shUpd.rowCount}`,
          );

          // Even the owner must not be able to rewrite a snapshot: the trigger
          // is the guarantee that history cannot be silently altered.
          //
          // The role must be reset first. While `SET LOCAL ROLE authenticated` is
          // in effect, RLS filters this UPDATE to zero rows and no trigger ever
          // fires — the check would pass for the wrong reason (or, as observed,
          // fail while looking like a policy bug). RESET ROLE restores the table
          // owner, so RLS is bypassed and only the trigger stands between this
          // statement and silent history rewriting.
          await client.query("RESET ROLE");
          await client.query("SAVEPOINT before_owner_update");
          let triggerError = null;
          try {
            await client.query(
              `UPDATE public.cbt_attempt_questions SET question_text = 'TAMPERED' WHERE id = $1`,
              [aq.rows[0].id],
            );
          } catch (err) {
            triggerError = err && err.message ? err.message : String(err);
          }
          await client.query("ROLLBACK TO SAVEPOINT before_owner_update");
          check(
            "even the table owner cannot update a snapshot (immutability trigger)",
            // Match the trigger's own message: the statement must fail because
            // snapshots are immutable, not because of an unrelated error.
            Boolean(triggerError) && /immutable/i.test(triggerError),
            triggerError ? triggerError.split("\n")[0].slice(0, 90) : "the UPDATE was allowed",
          );
        } finally {
          await client.query("ROLLBACK");
        }
      }
    }

    // ── 8. Structural alignment (Phase 16 / migration 047) ───────────────────
    console.log("\n8. CBT references cannot cross a school boundary (structural alignment)");
    if (!cbtRows.some((r) => r.relname === "cbt_assessments")) {
      note("cbt_assessments is missing — alignment checks skipped");
    } else {
      const ownerClass = (
        await client.query(
          `SELECT c.id AS class_id, c.school_id FROM public.classes c ORDER BY c.school_id LIMIT 1`,
        )
      ).rows[0];
      const foreign = ownerClass
        ? (
            await client.query(`SELECT id FROM public.schools WHERE id <> $1 LIMIT 1`, [
              ownerClass.school_id,
            ])
          ).rows[0]
        : null;
      const student = (
        await client.query(
          `SELECT s.id AS student_id, s.profile_id, s.school_id, s.class_id
             FROM public.students s WHERE s.class_id IS NOT NULL LIMIT 1`,
        )
      ).rows[0];

      if (!ownerClass || !foreign || !student) {
        note(
          "need one class, two schools and one enrolled student to test alignment — skipped",
        );
      } else {
        const oSchool = ownerClass.school_id;
        const fSchool = foreign.id;

        // Preconditions: without these the negatives would pass for the wrong reason.
        check(
          "alignment probe spans two distinct schools",
          oSchool !== fSchool,
          oSchool === fSchool ? "the two ids are identical" : "ok",
        );
        check(
          "the probe student is enrolled in the probed class",
          student.class_id === ownerClass.class_id && student.school_id === oSchool,
          `student.class=${student.class_id} class=${ownerClass.class_id}`,
        );

        const tag = "ALIGN PROBE " + crypto.randomUUID();
        await client.query("BEGIN");
        try {
          const expectRejected = async (label, sql, params, fragment) => {
            await client.query("SAVEPOINT s");
            let msg = null;
            try {
              await client.query(sql, params);
            } catch (e) {
              msg = e && e.message ? e.message : String(e);
            }
            await client.query("ROLLBACK TO SAVEPOINT s");
            const matched = Boolean(msg) && msg.includes(fragment);
            check(
              label,
              matched,
              msg ? msg.split("\n")[0].slice(0, 105) : "the INSERT was ALLOWED",
            );
          };

          // Positive control: the same-shaped insert, inside one school, works.
          const asm = await client.query(
            `INSERT INTO public.cbt_assessments (school_id, class_id, title, status)
             VALUES ($1, $2, $3, 'published') RETURNING id`,
            [oSchool, ownerClass.class_id, tag],
          );
          const asmId = asm.rows[0].id;
          check(
            "a same-school assessment is accepted (positive control)",
            Boolean(asmId),
            asmId ? "inserted" : "no id returned",
          );

          await expectRejected(
            "an assessment cannot reference another school's class",
            `INSERT INTO public.cbt_assessments (school_id, class_id, title)
             VALUES ($1, $2, $3)`,
            [fSchool, ownerClass.class_id, tag + " x"],
            "cbt_assessments_class_id_school_fkey",
          );

          const attempt = await client.query(
            `INSERT INTO public.cbt_attempts
               (school_id, assessment_id, student_id, student_profile_id, attempt_number)
             VALUES ($1, $2, $3, $4, 1) RETURNING id`,
            [oSchool, asmId, student.student_id, student.profile_id],
          );
          const attemptId = attempt.rows[0].id;

          await expectRejected(
            "an attempt question cannot carry another school's id",
            `INSERT INTO public.cbt_attempt_questions
               (school_id, attempt_id, student_profile_id, display_order, question_type, question_text, marks)
             VALUES ($1, $2, $3, 0, 'mcq', 'x', 1)`,
            [fSchool, attemptId, student.profile_id],
            "_school_fkey",
          );

          await expectRejected(
            "a result cannot be written against another school's attempt",
            `INSERT INTO public.cbt_results (school_id, attempt_id, total_score, max_score)
             VALUES ($1, $2, 0, 0)`,
            [fSchool, attemptId],
            "cbt_results_attempt_id_school_fkey",
          );

          const q = await client.query(
            `INSERT INTO public.cbt_questions (school_id, question_type, question_text, marks)
             VALUES ($1, 'mcq', $2, 1) RETURNING id`,
            [oSchool, tag + " question"],
          );

          // Both referenced rows belong to oSchool, so this can only be rejected by
          // an ALIGNMENT constraint. Passing a random uuid instead would trip the
          // ordinary single-column question FK and prove nothing about alignment.
          await expectRejected(
            "an assessment question cannot cross a school boundary",
            `INSERT INTO public.cbt_assessment_questions (school_id, assessment_id, question_id)
             VALUES ($1, $2, $3)`,
            [fSchool, asmId, q.rows[0].id],
            "_school_fkey",
          );
        } finally {
          await client.query("ROLLBACK");
        }
      }
    }

    // ── 9. Student visibility is bounded by class, not just by school ────────
    console.log("\n9. A student sees only their own class's PUBLISHED assessments");
    if (!cbtRows.some((r) => r.relname === "cbt_assessments")) {
      note("cbt_assessments is missing — visibility checks skipped");
    } else {
      const student = (
        await client.query(
          `SELECT s.school_id, s.class_id, s.profile_id
             FROM public.students s
            WHERE s.class_id IS NOT NULL AND s.profile_id IS NOT NULL LIMIT 1`,
        )
      ).rows[0];

      if (!student) {
        note("no enrolled student with an account — visibility checks skipped");
      } else {
        const tag = "VIS PROBE " + crypto.randomUUID();
        const ownTitle = tag + " own";
        const otherTitle = tag + " other";
        const draftTitle = tag + " draft";

        await client.query("BEGIN");
        try {
          let otherClass = (
            await client.query(
              `SELECT id FROM public.classes WHERE school_id = $1 AND id <> $2 LIMIT 1`,
              [student.school_id, student.class_id],
            )
          ).rows[0];

          if (!otherClass) {
            // Created inside the transaction and rolled back, so staging is unmodified.
            otherClass = (
              await client.query(
                `INSERT INTO public.classes (school_id, name) VALUES ($1, $2) RETURNING id`,
                [student.school_id, tag + " class"],
              )
            ).rows[0];
          }

          for (const [title, classId, status] of [
            [ownTitle, student.class_id, "published"],
            [otherTitle, otherClass.id, "published"],
            [draftTitle, student.class_id, "draft"],
          ]) {
            await client.query(
              `INSERT INTO public.cbt_assessments (school_id, class_id, title, status)
               VALUES ($1, $2, $3, $4)`,
              [student.school_id, classId, title, status],
            );
          }

          // Anti-vacuity: as the owner all three rows must exist. If the inserts
          // above silently did nothing, the student-side counts below would be
          // zero for the wrong reason.
          const owner = await client.query(
            `SELECT count(*) AS n FROM public.cbt_assessments WHERE title = ANY($1)`,
            [[ownTitle, otherTitle, draftTitle]],
          );
          check(
            "all three visibility probes exist (anti-vacuity)",
            Number(owner.rows[0].n) === 3,
            `owner sees ${owner.rows[0].n} of 3`,
          );

          await client.query("SET LOCAL ROLE authenticated");
          await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({
              sub: student.profile_id,
              role: "authenticated",
              app_role: "student",
              school_id: student.school_id,
            }),
          ]);

          const seen = await client.query(
            `SELECT
               count(*) FILTER (WHERE title = $1) AS own,
               count(*) FILTER (WHERE title = $2) AS other,
               count(*) FILTER (WHERE title = $3) AS draft
             FROM public.cbt_assessments WHERE title = ANY($4)`,
            [ownTitle, otherTitle, draftTitle, [ownTitle, otherTitle, draftTitle]],
          );
          const row = seen.rows[0];
          check(
            "a student CAN read their own class's published assessment",
            Number(row.own) === 1,
            `saw ${row.own}`,
          );
          check(
            "a student CANNOT read a published assessment for another class in the same school",
            Number(row.other) === 0,
            `saw ${row.other}`,
          );
          check(
            "a student CANNOT read an unpublished assessment for their own class",
            Number(row.draft) === 0,
            `saw ${row.draft}`,
          );
        } finally {
          await client.query("ROLLBACK");
        }
      }
    }

    // ── 10. Delivery invariants (Phase 18-19 / migration 048) ────────────────
    console.log("\n10. One live attempt, one official result (database-enforced)");
    if (!cbtRows.some((r) => r.relname === "cbt_attempts")) {
      note("cbt_attempts is missing — delivery invariant checks skipped");
    } else {
      const indexRows = await client.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname='public'
            AND indexname IN ('cbt_one_live_attempt_per_student','cbt_one_official_result_per_student')`,
      );
      const indexNames = indexRows.rows.map((r) => r.indexname);
      check(
        "the one-live-attempt index exists",
        indexNames.includes("cbt_one_live_attempt_per_student"),
        indexNames.join(", ") || "neither index found",
      );
      check(
        "the one-official-result index exists",
        indexNames.includes("cbt_one_official_result_per_student"),
        indexNames.join(", ") || "neither index found",
      );

      const target = (
        await client.query(
          `SELECT s.id AS student_id, s.profile_id, s.school_id, s.class_id
             FROM public.students s WHERE s.class_id IS NOT NULL LIMIT 1`,
        )
      ).rows[0];

      if (!target) {
        note("no enrolled student — invariant behaviour checks skipped");
      } else {
        await client.query("BEGIN");
        try {
          const expectRejected = async (label, sql, params, fragment) => {
            await client.query("SAVEPOINT s");
            let msg = null;
            try {
              await client.query(sql, params);
            } catch (e) {
              msg = e && e.message ? e.message : String(e);
            }
            await client.query("ROLLBACK TO SAVEPOINT s");
            const matched = Boolean(msg) && msg.includes(fragment);
            check(label, matched, msg ? msg.split("\n")[0].slice(0, 100) : "the INSERT was ALLOWED");
          };

          const tag = "DELIVERY PROBE " + crypto.randomUUID();

          const asm = await client.query(
            `INSERT INTO public.cbt_assessments (school_id, class_id, title, status)
             VALUES ($1, $2, $3, 'published') RETURNING id`,
            [target.school_id, target.class_id, tag],
          );
          const assessmentId = asm.rows[0].id;

          const first = await client.query(
            `INSERT INTO public.cbt_attempts
               (school_id, assessment_id, student_id, student_profile_id, attempt_number, status)
             VALUES ($1, $2, $3, $4, 1, 'in_progress') RETURNING id`,
            [target.school_id, assessmentId, target.student_id, target.profile_id],
          );
          check(
            "a first live attempt is accepted (positive control)",
            Boolean(first.rows[0]?.id),
            first.rows[0]?.id ? "inserted" : "no id returned",
          );

          await expectRejected(
            "a SECOND live attempt for the same student is refused",
            `INSERT INTO public.cbt_attempts
               (school_id, assessment_id, student_id, student_profile_id, attempt_number, status)
             VALUES ($1, $2, $3, $4, 2, 'in_progress')`,
            [target.school_id, assessmentId, target.student_id, target.profile_id],
            "cbt_one_live_attempt_per_student",
          );

          const closed = await client.query(
            `INSERT INTO public.cbt_attempts
               (school_id, assessment_id, student_id, student_profile_id, attempt_number, status)
             VALUES ($1, $2, $3, $4, 3, 'submitted') RETURNING id`,
            [target.school_id, assessmentId, target.student_id, target.profile_id],
          );
          const closedId = closed.rows[0].id;
          check(
            "a closed attempt alongside a live one is still allowed (history is append-only)",
            Boolean(closedId),
            closedId ? "inserted" : "no id returned",
          );

          await client.query(
            `INSERT INTO public.cbt_results
               (school_id, attempt_id, assessment_id, student_id, total_score, max_score, is_official)
             VALUES ($1, $2, $3, $4, 5, 10, TRUE)`,
            [target.school_id, first.rows[0].id, assessmentId, target.student_id],
          );

          await expectRejected(
            "a SECOND official result for the same student is refused",
            `INSERT INTO public.cbt_results
               (school_id, attempt_id, assessment_id, student_id, total_score, max_score, is_official)
             VALUES ($1, $2, $3, $4, 7, 10, TRUE)`,
            [target.school_id, closedId, assessmentId, target.student_id],
            "cbt_one_official_result_per_student",
          );

          // The same attempt may still hold a NON-official result, which is what
          // an attempt that was never promoted looks like.
          let secondResultError = null;
          try {
            await client.query(
              `INSERT INTO public.cbt_results
                 (school_id, attempt_id, assessment_id, student_id, total_score, max_score, is_official)
               VALUES ($1, $2, $3, $4, 7, 10, FALSE)`,
              [target.school_id, closedId, assessmentId, target.student_id],
            );
          } catch (e) {
            secondResultError = e && e.message ? e.message : String(e);
          }
          check(
            "a non-official result for another attempt is allowed",
            secondResultError === null,
            secondResultError ? secondResultError.split("\n")[0].slice(0, 100) : "inserted",
          );
        } finally {
          await client.query("ROLLBACK");
        }
      }
    }

    // ---------------------------------------------------------------------
    // 11. Writes on the 043 tables require a staff role (S3)
    // ---------------------------------------------------------------------
    // 043 gave these tables ONE predicate — school-scoped but ROLE-BLIND — so a
    // token carrying app_role = 'student' satisfied it exactly as a teacher's
    // did, and could INSERT, UPDATE and DELETE its own school's marks. 054
    // narrows writes to staff.
    //
    // Both halves are asserted. "A student cannot write" is also true of a table
    // nobody can write to, and "a teacher can write" is also true of a table with
    // no policies at all — so neither is worth much on its own.
    console.log("\n11. Writes on the tables migration 043 covered require a staff role (S3)");

    {
      const ROLE_AWARE_TABLES = [
        "student_scores", "term_results", "term_result_components",
        "report_card_submissions", "attendance_records", "psychomotor_scores",
        "affective_scores", "teacher_comments", "school_admin_comments",
        "components_templates", "grading_templates", "psychomotor_templates",
        "affective_templates", "class_components_templates", "class_grading_templates",
        "class_psychomotor_templates", "class_affective_templates",
        "level_components_templates", "level_grading_templates",
        "level_psychomotor_templates", "level_affective_templates",
        "academic_levels", "class_teachers", "ai_import_logs",
      ];

      const { rows: writePolicies } = await client.query(
        `SELECT tablename, policyname, cmd,
                coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = ANY($1)
            AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')`,
        [ROLE_AWARE_TABLES],
      );

      // Anti-vacuity first: a table with no write policy at all would sail past
      // the next check while proving nothing.
      const withWritePolicy = new Set(writePolicies.map((p) => p.tablename));
      const uncovered = ROLE_AWARE_TABLES.filter((t) => !withWritePolicy.has(t));
      check(
        "every 043 table has a write policy to inspect",
        uncovered.length === 0,
        uncovered.length
          ? `no write policy on: ${uncovered.join(", ")}`
          : `${writePolicies.length} write policies across ${withWritePolicy.size} tables`,
      );

      const roleBlind = writePolicies.filter((p) => !p.expr.includes("app_role"));
      check(
        "no write policy on those tables is role-blind",
        roleBlind.length === 0,
        roleBlind.length
          ? roleBlind.map((p) => `${p.tablename}.${p.policyname}`).join(", ")
          : "every write policy names app_role",
      );

      const { rows: readPolicies } = await client.query(
        `SELECT DISTINCT tablename FROM pg_policies
          WHERE schemaname = 'public' AND tablename = ANY($1) AND cmd IN ('SELECT', 'ALL')`,
        [ROLE_AWARE_TABLES],
      );
      const readable = new Set(readPolicies.map((p) => p.tablename));
      const unreadable = ROLE_AWARE_TABLES.filter((t) => !readable.has(t));
      check(
        "reads were NOT withdrawn — every table still has a SELECT policy",
        unreadable.length === 0,
        unreadable.length ? `no SELECT policy on: ${unreadable.join(", ")}` : "all readable",
      );

      // Behavioural proof on `academic_levels`: its only foreign key is
      // school_id, so a probe row needs no fixture beyond the school itself.
      const rlsRefusal = (msg) => typeof msg === "string" && /row-level security/i.test(msg);

      const tryInsert = async (label, actor, targetSchoolId) => {
        let error = null;
        await asActor(client, actor, async () => {
          try {
            await client.query(
              "INSERT INTO public.academic_levels (school_id, name) VALUES ($1, $2)",
              [targetSchoolId, `RLS PROBE ${label}`],
            );
          } catch (e) {
            error = e && e.message ? e.message : String(e);
          }
        });
        return error;
      };
      const briefly = (msg) => (msg ? msg.split("\n")[0].slice(0, 90) : "inserted");

      const teacherErr = await tryInsert("teacher", { schoolId: a.id, appRole: "teacher" }, a.id);
      check(
        "a teacher CAN create a level in their own school (positive control)",
        teacherErr === null,
        briefly(teacherErr),
      );

      const adminErr = await tryInsert("admin", { schoolId: a.id, appRole: "school_admin" }, a.id);
      check("a school admin CAN create a level in their own school", adminErr === null, briefly(adminErr));

      const studentErr = await tryInsert("student", { schoolId: a.id, appRole: "student" }, a.id);
      check(
        "a student CANNOT create a level — refused by RLS, not by a missing grant",
        rlsRefusal(studentErr),
        studentErr ? briefly(studentErr) : "!!! INSERT SUCCEEDED",
      );

      // The check that would have caught the original posture: 043 let this
      // through, because the predicate never looked at the role.
      const noRoleErr = await tryInsert("norole", { schoolId: a.id }, a.id);
      check(
        "a tenant token carrying NO app_role CANNOT create a level",
        rlsRefusal(noRoleErr),
        noRoleErr ? briefly(noRoleErr) : "!!! INSERT SUCCEEDED — 043's role-blind policy is still in force",
      );

      const crossErr = await tryInsert("cross", { schoolId: b.id, appRole: "teacher" }, a.id);
      check(
        "a teacher of another school CANNOT create a level in this one",
        rlsRefusal(crossErr),
        crossErr ? briefly(crossErr) : "!!! INSERT SUCCEEDED",
      );

      let superErr = null;
      await asSuperAdmin(client, a.id, async () => {
        try {
          await client.query(
            "INSERT INTO public.academic_levels (school_id, name) VALUES ($1, $2)",
            [a.id, "RLS PROBE super"],
          );
        } catch (e) {
          superErr = e && e.message ? e.message : String(e);
        }
      });
      check(
        "a super admin CAN still create a level (capability preserved)",
        superErr === null,
        briefly(superErr),
      );
    }

    const failed = results.filter((r) => !r.passed);
    console.log("\n" + "-".repeat(66));
    console.log(`${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length > 0) {
      console.log("\nFAILED:");
      for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("rls-isolation-test error:", err.message);
  process.exit(2);
});
