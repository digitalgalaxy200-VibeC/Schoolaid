const fs = require("fs");
const path = require("path");

// Previously hardcoded to https://iojiahkehnijxxczrgft.supabase.co — a
// different Supabase project from the one this app actually points to.
// Now read from the environment. See docs/CORRECTIONS_SECURITE.md.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first");
  process.exit(1);
}
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

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
      console.log("   1. Go to: https://supabase.com/dashboard/project/" + PROJECT_REF);
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
