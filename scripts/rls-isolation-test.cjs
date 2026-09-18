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
 * READ-ONLY: every tenant statement runs inside a transaction that is rolled
 * back. Nothing is inserted, updated or deleted.
 *
 * Usage:
 *     npm run test:rls
 *
 * Connection comes from STAGING_DB_URL (or DATABASE_URL), falling back to the
 * repo's gitignored .env.staging. Credentials are never hard-coded here.
 */

const fs = require("fs");
const path = require("path");
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
 * have RLS enabled with zero policies. Measured at 28 on 2026-09-18.
 *
 * This is a ratchet: it may never grow, and it must reach 0 before those tables
 * are read through a tenant-scoped client. Tables without `school_id` (e.g.
 * `rate_limits`, `password_history`) are excluded — they are not tenant data and
 * are intentionally service-role-only.
 */
const MAX_TENANT_POLICYLESS_TABLES = 28;

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
