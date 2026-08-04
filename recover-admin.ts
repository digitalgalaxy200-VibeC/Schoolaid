import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.staging" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function recoverAdmin() {
  const email = "gwyn.ukoha@gmail.com";
  const password = `SUPER_${Date.now().toString(36).toUpperCase()}_admin123!`;

  console.log(`Recovering super admin: ${email}`);

  // 1. Try to find existing auth user by email
  const { data: { users } } = await supabase.auth.admin.listUsers();
  let authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (authUser) {
    console.log(`Auth user found (ID: ${authUser.id}). Updating password...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { role: "super_admin", full_name: "System Administrator" }
    });
    if (updateErr) {
      console.error("Failed to update auth password:", updateErr);
      return;
    }
  } else {
    console.log("Auth user not found. Creating...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "super_admin", full_name: "System Administrator" }
    });
    if (createErr) {
      console.error("Failed to create auth user:", createErr);
      return;
    }
    authUser = newUser.user;
  }

  // 2. Ensure profile exists and email matches
  console.log(`Checking profile for ID: ${authUser.id}`);
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();

  if (!profile) {
    console.log("Profile not found. Creating super_admin profile...");
    const { error: profErr } = await supabase.from("profiles").insert({
      id: authUser.id,
      email: authUser.email,
      role: "super_admin",
      full_name: "System Administrator",
      is_active: true
    });
    if (profErr) {
      console.error("Failed to create profile:", profErr);
      return;
    }
  } else {
    console.log("Profile found. Updating email and role...");
    await supabase.from("profiles").update({ 
      email: authUser.email,
      role: "super_admin"
    }).eq("id", authUser.id);
  }

  // 3. Ensure super_admins row exists
  const { data: superAdmin } = await supabase.from("super_admins").select("*").eq("profile_id", authUser.id).maybeSingle();
  if (!superAdmin) {
    console.log("Super admin row not found. Creating...");
    await supabase.from("super_admins").insert({
      profile_id: authUser.id,
      email: authUser.email,
    });
  }

  console.log("\n=================================");
  console.log("RECOVERY SUCCESSFUL!");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log("=================================\n");
}

recoverAdmin();
