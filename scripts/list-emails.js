#!/usr/bin/env node
/**
 * Read-only: list the email addresses on an environment.
 *
 * Loads `.env.staging` explicitly (never `.env.local`, which can be switched to
 * production by `npm run env:production`) and asks `lib/db-guard.js` first, so
 * this can only ever read staging unless the production ref is named on purpose.
 *
 * It selects `profiles.email` only — no passwords. Plaintext passwords are not
 * stored anywhere (see `scripts/get_creds.js`), so there is nothing here to leak.
 *
 * Run:
 *   node scripts/list-emails.js                 # staging
 *   node scripts/list-emails.js --by-school      # group by school instead
 */

const fs = require("fs");
const path = require("path");
const { guardDatabase, refFromUrl } = require("./lib/db-guard");

function loadEnv(file) {
  const txt = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const out = {};
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(".env.staging");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

guardDatabase({ ref: refFromUrl(url), action: "read the user email list from" });

if (!key) {
  console.error("REFUSING: no SUPABASE_SERVICE_ROLE_KEY in .env.staging");
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const bySchool = process.argv.includes("--by-school");

async function fetchAll() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, email, role, is_active, schools(name)")
      .order("role")
      .order("full_name")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

(async () => {
  try {
    const rows = await fetchAll();
    console.log(`\n${rows.length} profiles on ${url}\n`);

    if (bySchool) {
      const groups = new Map();
      for (const r of rows) {
        const k = r.schools?.name || "(no school / platform)";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      for (const [school, list] of [...groups.entries()].sort()) {
        console.log(`\n## ${school} (${list.length})`);
        for (const r of list) console.log(`  ${r.role.padEnd(12)} ${r.email}`);
      }
    } else {
      const counts = {};
      for (const r of rows) {
        counts[r.role] = (counts[r.role] || 0) + 1;
        console.log(
          [
            r.role.padEnd(12),
            (r.email || "—").padEnd(38),
            (r.schools?.name || "—").padEnd(24),
            r.is_active ? "" : "[inactive]",
          ].join(" "),
        );
      }
      console.log("\nBy role:", counts);
    }
  } catch (err) {
    console.error("FAILED:", err.message || err);
    process.exit(1);
  }
})();
