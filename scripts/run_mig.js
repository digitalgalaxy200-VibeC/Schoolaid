const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:password@localhost:5432/postgres",
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
