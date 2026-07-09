const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    env[key.trim()] = rest.join('=').trim().replace(/(^"|"$)/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking schools for missing admins...");
  const { data: schools } = await supabase.from('schools').select('id, name, slug');
  for (const school of schools) {
    const { data: admins } = await supabase.from('school_admins').select('id').eq('school_id', school.id);
    if (!admins || admins.length === 0) {
      console.log(`Fixing school: ${school.name}...`);
      const adminEmail = `admin@${school.slug}.edu`;
      const adminPassword = `Admin${Math.floor(1000 + Math.random() * 9000)}!`;
      
      let schoolUserId = null;
      const { data: sCreateData, error: sCreateError } = await supabase.auth.admin.createUser({
        email: adminEmail, password: adminPassword, email_confirm: true,
      });

      if (sCreateData?.user?.id) {
        schoolUserId = sCreateData.user.id;
        console.log(` - Created new auth user`);
      } else {
        const { data: sListData } = await supabase.auth.admin.listUsers();
        const existingS = sListData?.users?.find((u) => u.email === adminEmail);
        if (existingS) {
          schoolUserId = existingS.id;
          await supabase.auth.admin.updateUserById(schoolUserId, { password: adminPassword });
          console.log(` - Found existing auth user, updated password`);
        } else {
           console.log(` - Failed to create/find auth user for ${school.name}:`, sCreateError);
           continue;
        }
      }

      if (schoolUserId) {
         await supabase.from("profiles").upsert({
           id: schoolUserId, school_id: school.id, full_name: `${school.name} Admin`, email: adminEmail, role: "school_admin"
         });
         await supabase.from("school_admins").insert({
           school_id: school.id, profile_id: schoolUserId, first_name: "School", last_name: "Admin", generated_password: adminPassword, must_change_password: true
         });
         console.log(` - FIXED! Added admin for ${school.name}`);
      }
    }
  }
  console.log("Done.");
}

run().catch(console.error);
