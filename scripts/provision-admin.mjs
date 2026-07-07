import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log("Provisioning Super Admin account in database...");
  
  const email = 'admin@schoolaid.com';
  const password = 'Admin123!';

  // 1. Try to create the user in GoTrue Auth
  let { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = authData?.user?.id;

  if (authError) {
    console.log("User might already exist. Attempting to fetch existing user... Error:", authError.message);
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find(u => u.email === email);
    
    if (existing) {
      console.log(`Found existing user with ID ${existing.id}. Updating password...`);
      await supabase.auth.admin.updateUserById(existing.id, { password });
      userId = existing.id;
    } else {
      console.error("Could not create or find user!");
      process.exit(1);
    }
  } else {
    console.log(`Created new auth user with ID ${userId}`);
  }

  // 2. Upsert profile record to give them super_admin role
  if (userId) {
    console.log("Assigning super_admin role in profiles table...");
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email: email,
      full_name: 'Super Admin',
      role: 'super_admin'
    });

    if (profileError) {
      console.error("Failed to create profile:", profileError.message);
    } else {
      console.log("✅ Super Admin provisioned successfully!");
    }
  }
}

main().catch(console.error);
