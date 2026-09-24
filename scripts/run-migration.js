const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("❌ Set SUPABASE_DB_PASSWORD env var first");
  process.exit(1);
}

const encodedPassword = encodeURIComponent(PASSWORD);
const connectionString = `postgresql://postgres:${encodedPassword}@db.iojiahkehnijxxczgrft.supabase.co:5432/postgres`;

// ── GUARD ────────────────────────────────────────────────────────────────────
// This connection string names PRODUCTION, and the migration below is
// `001_initial_schema.sql`. Guarded before anything connects. See
// scripts/lib/db-guard.js.
const { guardDatabase, refFromUrl } = require("./lib/db-guard");
guardDatabase({
  ref: refFromUrl(connectionString),
  action: "run schema migrations against",
});

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
