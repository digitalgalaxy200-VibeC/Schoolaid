const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://iojiahkehnijxxczgrft.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌ Set SUPABASE_SERVICE_ROLE_KEY env var first");
  process.exit(1);
}

// ── GUARD ────────────────────────────────────────────────────────────────────
// The URL above is PRODUCTION, and this runs schema migrations through an RPC.
const { guardDatabase, refFromUrl } = require("./lib/db-guard");
guardDatabase({
  ref: refFromUrl(SUPABASE_URL),
  action: "run schema migrations against",
});

async function runSQL(sql, label) {
  console.log(`📦 ${label}...`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }
  console.log(`✅ ${label} done`);
}

async function run() {
  // Try SQL endpoint via management API or fallback to instructions
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "001_initial_schema.sql"),
    "utf8"
  );

  try {
    await runSQL(migration, "Migration");
  } catch (e) {
    if (e.message.includes("404") || e.message.includes("not found")) {
      console.log("\n⚠️  Cannot run SQL via API on this Supabase plan.");
      console.log("\n📋 Please run the migration manually:");
      console.log("   1. Go to: https://supabase.com/dashboard/project/iojiahkehnijxxczrgft");
      console.log("   2. Open SQL Editor");
      console.log("   3. Paste and run: supabase/migrations/001_initial_schema.sql");
      console.log("   4. Then paste and run: supabase/seed.sql");
      console.log("\nBoth files are in your project at:");
      console.log("   - supabase/migrations/001_initial_schema.sql");
      console.log("   - supabase/seed.sql");
      process.exit(1);
    }
    throw e;
  }

  // Run seed
  const seed = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "seed.sql"),
    "utf8"
  );
  await runSQL(seed, "Seed");
  console.log("\n🎉 Phase 1 database setup complete!");
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
