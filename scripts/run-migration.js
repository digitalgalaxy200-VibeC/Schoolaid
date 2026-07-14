const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("❌ Set SUPABASE_DB_PASSWORD env var first");
  process.exit(1);
}

// Previously this hardcoded db.iojiahkehnijxxczrgft.supabase.co — a
// different (and unaccounted-for) Supabase project from the one this app
// actually points to. The host is now derived from NEXT_PUBLIC_SUPABASE_URL
// so this script always targets whichever project is configured in your
// current environment. See docs/CORRECTIONS_SECURITE.md.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error("❌ Set NEXT_PUBLIC_SUPABASE_URL env var first");
  process.exit(1);
}
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];

const encodedPassword = encodeURIComponent(PASSWORD);
const connectionString = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("✅ Connected to Supabase Postgres");

  // Run migration
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "001_initial_schema.sql"),
    "utf8"
  );
  console.log("📦 Running migration...");
  await client.query(migration);
  console.log("✅ Migration applied successfully");

  // Run seed
  const seed = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "seed.sql"),
    "utf8"
  );
  console.log("🌱 Running seed...");
  await client.query(seed);
  console.log("✅ Seed data inserted successfully");

  await client.end();
  console.log("🎉 Phase 1 database setup complete!");
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
