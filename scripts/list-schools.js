const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: schools } = await supabase.from("schools").select("id, name, abbreviation, slug").order("name");
  console.log("ALL SCHOOLS:");
  for (const s of (schools || [])) {
    console.log(`  - ${s.name} | slug: ${s.slug} | abbr: ${s.abbreviation} | id: ${s.id}`);
  }
  process.exit(0);
}
main();
