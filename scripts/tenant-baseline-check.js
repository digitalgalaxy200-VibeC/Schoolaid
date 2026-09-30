// Phase 1 audit — READ-ONLY database sweep (tenant isolation evidence)
// Queries Supabase management API with the token from .env.local.
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const out = {};
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const TOKEN = loadEnv(path.join(__dirname, "..", ".env.local")).SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("missing token"); process.exit(1); }

const STAGING = "noyegdgrfzopfrwjunot";
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const Q1 = `
SELECT c.relname AS table_name,
  EXISTS (SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='school_id') AS has_school_id,
  c.relrowsecurity AS rls_on,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relname;
`;

const Q2 = `
SELECT s.id, s.name, s.is_active,
  (SELECT count(*) FROM students st WHERE st.school_id=s.id) AS students,
  (SELECT count(*) FROM classes cl WHERE cl.school_id=s.id) AS classes,
  (SELECT count(*) FROM student_bills b WHERE b.school_id=s.id) AS bills,
  (SELECT count(*) FROM payments p WHERE p.school_id=s.id) AS payments,
  (SELECT count(*) FROM receipts r WHERE r.school_id=s.id) AS receipts
FROM schools s ORDER BY s.name;
`;

const Q3 = `
SELECT s.name,
  (SELECT count(*) FROM profiles p WHERE p.school_id=s.id) AS profiles
FROM schools s ORDER BY s.name;
`;

(async () => {
  for (const [label, sql] of [["TABLES", Q1], ["SCHOOLS_BASELINE", Q2], ["PROFILES_BY_SCHOOL", Q3]]) {
    console.log(`\n=== ${label} ===`);
    try { console.log(JSON.stringify(await query(sql), null, 1).slice(0, 12000)); }
    catch (e) { console.log("ERR:", e.message); }
  }
})();
