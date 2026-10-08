#!/usr/bin/env node
/**
 * Apply (or dry-run, or verify) a SQL migration against ONE environment,
 * through the Supabase Management API.
 *
 * Follows `scripts/README.md`: staging runs freely, any other database must be
 * named out loud by ref (`--confirm-target=<ref>`). The guard is called before
 * anything is sent.
 *
 * Usage:
 *   node scripts/db-migrate.js --env=staging --verify
 *   node scripts/db-migrate.js --env=staging --file=supabase/migrations/074_....sql
 *   node scripts/db-migrate.js --env=production --file=... --dry-run \
 *        --confirm-target=iojiahkehnijxxczgrft
 *
 * A real apply runs inside BEGIN … COMMIT; a dry-run inside BEGIN … ROLLBACK,
 * so the real schema is exercised and nothing is committed.
 */

const fs = require("fs");
const path = require("path");
const { guardDatabase, refFromUrl } = require("./lib/db-guard");

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const envName = opt("env") || "staging";
const file = opt("file");
const dryRun = hasFlag("dry-run");
const verify = hasFlag("verify");

const ENV_FILE = envName === "production" ? ".env.production" : ".env.staging";

function loadEnv(f) {
  const txt = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const out = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(ENV_FILE);
const ref = refFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
const token = env.SUPABASE_ACCESS_TOKEN || loadEnv(".env.staging").SUPABASE_ACCESS_TOKEN;

guardDatabase({
  ref,
  action: verify ? "read the copilot schema from" : `apply "${file || "(no file)"}" to`,
});

if (!token) {
  console.error("REFUSING: no SUPABASE_ACCESS_TOKEN available.");
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const TABLES = `('copilot_operations','copilot_operation_steps','copilot_messages','copilot_idempotency')`;

const VERIFY_TABLES = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ${TABLES} ORDER BY table_name;`;
const VERIFY_CONSTRAINTS = `SELECT c.relname AS tbl, con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid WHERE c.relname IN ${TABLES} AND con.contype = 'c' ORDER BY c.relname, con.conname;`;
const VERIFY_COLUMNS = `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ${TABLES} AND column_name IN ('request_id','result','status','plan_status') ORDER BY table_name, column_name;`;
const VERIFY_IDEMPOTENCY = `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='copilot_idempotency' ORDER BY ordinal_position;`;

(async () => {
  try {
    if (verify) {
      console.log(`\n== verify: ${envName} (${ref}) ==`);
      console.log("tables    :", JSON.stringify(await sql(VERIFY_TABLES)));
      console.log("constraints:", JSON.stringify(await sql(VERIFY_CONSTRAINTS)));
      console.log("columns   :", JSON.stringify(await sql(VERIFY_COLUMNS)));
      console.log("idempotency:", JSON.stringify(await sql(VERIFY_IDEMPOTENCY)));
      return;
    }

    if (!file) {
      console.error("REFUSING: pass --file=<path>.sql (or --verify).");
      process.exit(1);
    }

    const body = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const query = dryRun ? `BEGIN;\n${body}\nROLLBACK;` : `BEGIN;\n${body}\nCOMMIT;`;

    console.log(`\n== ${dryRun ? "DRY-RUN" : "APPLY"}: ${file} -> ${envName} (${ref}) ==`);
    const result = await sql(query);
    console.log("result:", JSON.stringify(result).slice(0, 400));
    console.log(
      `\n${dryRun ? "DRY-RUN OK — rolled back, nothing committed." : "APPLIED — committed."}`,
    );
  } catch (err) {
    console.error("FAILED:", err.message || err);
    process.exit(1);
  }
})();
