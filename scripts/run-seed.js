const fs = require("fs");
const path = require("path");

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = "iojiahkehnijxxczrgft";

if (!SUPABASE_ACCESS_TOKEN) {
  console.error("❌ Set SUPABASE_ACCESS_TOKEN env var");
  process.exit(1);
}

async function run() {
  const seed = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "seed.sql"),
    "utf8"
  );

  console.log("🌱 Running seed via Management API...");

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query: seed }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Failed (${res.status}):`, text.substring(0, 500));
    process.exit(1);
  }

  console.log("✅ Seed executed successfully!");
  console.log("🎉 Phase 1 database setup complete!");
}

run().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
