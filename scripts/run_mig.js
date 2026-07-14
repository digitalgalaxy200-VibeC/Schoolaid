const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Previously hardcoded to a local "postgres:password@localhost" connection.
// For local Postgres development, set LOCAL_DATABASE_URL; this never touches
// a remote project. See docs/CORRECTIONS_SECURITE.md.
const CONNECTION_STRING = process.env.LOCAL_DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error("❌ Set LOCAL_DATABASE_URL env var, e.g. postgresql://postgres:<password>@localhost:5432/postgres");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: CONNECTION_STRING,
  });
  await client.connect();
  
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/013_school_abbreviations.sql"), "utf8");
  
  try {
    await client.query(sql);
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}
main();
