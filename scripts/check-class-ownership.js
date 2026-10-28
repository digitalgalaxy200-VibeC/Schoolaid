#!/usr/bin/env node
/**
 * READ-ONLY: find students whose `class_id` does not belong to their school.
 *
 * Why this exists
 * ---------------
 * The student update route used to write `class_id` from the request body
 * without checking it against the caller's school (fixed in the same change).
 * Validation only protects future writes, so before deploying we need to know
 * whether any row already sits in another tenant's class.
 *
 * It changes NOTHING: two SELECTs, printed. Correcting an affected row is a
 * decision for the school that owns the student, not something this script
 * should do quietly.
 *
 * Usage:
 *   node scripts/check-class-ownership.js --env=staging
 *   node scripts/check-class-ownership.js --env=production --confirm-target=iojiahkehnijxxczrgft
 */

const fs = require("fs");
const path = require("path");
const { guardDatabase, refFromUrl } = require("./lib/db-guard");

const argv = process.argv.slice(2);
const opt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const envName = opt("env") || "staging";
const ENV_FILE = envName === "production" ? ".env.production" : ".env.staging";

function loadEnv(file) {
  const txt = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
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

guardDatabase({ ref, action: "run a read-only class-ownership check on" });

if (!token) {
  console.error("REFUSING: no SUPABASE_ACCESS_TOKEN available.");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// A class is foreign when it exists but belongs to a different school. The
// `cl.id IS NULL` arm covers a dangling id (the FK is ON DELETE SET NULL, so it
// should be unreachable, but a missing parent row is still "not your class").
const WHERE = `
  st.class_id IS NOT NULL
  AND (cl.id IS NULL OR cl.school_id <> st.school_id)
`;

const COUNT = `
SELECT count(*)::int AS affected
FROM students st
LEFT JOIN classes cl ON cl.id = st.class_id
WHERE ${WHERE};
`;

const ROWS = `
SELECT
  st.id                AS student_uuid,
  st.student_id        AS admission_no,
  pr.full_name,
  pr.email,
  st.school_id         AS student_school_id,
  s.name               AS student_school,
  st.class_id,
  cl.name              AS class_name,
  cl.school_id         AS class_school_id,
  cs.name              AS class_school
FROM students st
LEFT JOIN classes cl  ON cl.id = st.class_id
LEFT JOIN schools cs  ON cs.id = cl.school_id
LEFT JOIN schools s   ON s.id  = st.school_id
LEFT JOIN profiles pr ON pr.id = st.profile_id
WHERE ${WHERE}
ORDER BY s.name, pr.full_name
LIMIT 500;
`;

(async () => {
  const [count] = await query(COUNT);
  console.log(`\n=== ${envName} (${ref}) ===`);
  console.log(`Students whose class belongs to another school: ${count?.affected ?? "unknown"}`);

  if (!count?.affected) {
    console.log("Nothing to review.\n");
    return;
  }

  const rows = await query(ROWS);
  console.log("\nAffected rows (read-only — nothing has been changed):\n");
  console.table(rows);
  console.log(
    "\nDo NOT reassign these silently. Each one needs the owning school to say\n" +
      "which of ITS classes the student belongs in. Until then the student keeps\n" +
      "the row they have; the fixed API will refuse any further foreign class id.\n",
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
