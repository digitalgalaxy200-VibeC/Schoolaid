// script to update all existing student/teacher emails to the new clean format
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("Starting username backfill...");

  // Get all schools with their abbreviations
  const { data: schools, error: schoolErr } = await supabase.from("schools").select("id, abbreviation");
  if (schoolErr) throw schoolErr;

  const schoolMap = {};
  schools.forEach(s => schoolMap[s.id] = s.abbreviation);

  // Get all profiles for students and teachers
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, school_id, email");
  
  if (profErr) throw profErr;

  let updated = 0;
  for (const p of profiles) {
    if (p.role !== "student" && p.role !== "teacher") continue;
    
    const abbreviation = schoolMap[p.school_id] || "school";
    const name = p.full_name || `unnamed${p.role}`;
    
    let cleanName = name.replace(/\b(Mr|Mrs|Ms|Miss|Dr|Prof)\b\.?/gi, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (!cleanName) cleanName = p.role;

    // We generate the new target email (we won't bother checking collisions in this simple script 
    // unless they actually collide, in which case the auth update will fail and we can handle it)
    let newEmail = `${cleanName}@${abbreviation}.com`;
    let suffix = 2;

    // check if it's already using a clean name
    if (p.email && p.email.endsWith(`@${abbreviation}.com`) && !p.email.includes("-")) {
      // it looks reasonably clean already, skip
      continue;
    }

    let success = false;
    while (!success && suffix < 20) {
      try {
        console.log(`Updating ${p.email} -> ${newEmail} for ${p.full_name}`);
        
        // 1. Update Auth User
        const { error: authErr } = await supabase.auth.admin.updateUserById(p.id, { email: newEmail, email_confirm: true });
        
        if (authErr) {
          if (authErr.message.includes("already registered") || authErr.message.includes("unique")) {
            // collision!
            newEmail = `${cleanName}${suffix}@${abbreviation}.com`;
            suffix++;
            continue;
          } else {
            throw authErr;
          }
        }
        
        // 2. Update Profile
        await supabase.from("profiles").update({ email: newEmail }).eq("id", p.id);
        
        success = true;
        updated++;
      } catch (err) {
        console.error(`Error updating ${p.email}:`, err);
        break;
      }
    }
  }

  console.log(`Done! Updated ${updated} profiles.`);
}

main();
