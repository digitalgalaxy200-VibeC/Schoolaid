import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback").substring(0, 10);

  if (key !== secretKey) {
    return NextResponse.json({
      error: "Unauthorized.",
      hint: "The key is the first 10 characters of your SUPABASE_SERVICE_ROLE_KEY in Vercel.",
    }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let log: string[] = [];

  // Step 1: Provision Super Admin
  const email = "admin@schoolaid.com";
  const password = "Admin123!";
  
  let userId: string | null = null;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });

  if (createData?.user?.id) {
    userId = createData.user.id;
    log.push(`✅ Created new auth user: ${userId}`);
  } else {
    log.push(`ℹ️ Super admin create failed (${createError?.message}), trying to find existing...`);
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find((u) => u.email === email);
    if (existing) {
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, { password });
      log.push(`✅ Found super admin & reset password`);
    }
  }

  if (userId) {
    await supabase.from("profiles").upsert(
      { id: userId, email, full_name: "Super Admin", role: "super_admin" },
      { onConflict: "id" }
    );
    await supabase.from("profiles").update({ role: "super_admin" }).eq("id", userId);
  }

  // Step 2: Fix any schools missing an admin
  const { data: schools } = await supabase.from("schools").select("id, name, slug");
  if (schools) {
    for (const school of schools) {
      const { data: admins } = await supabase.from("school_admins").select("id").eq("school_id", school.id);
      if (!admins || admins.length === 0) {
        log.push(`⚠️ School ${school.name} is missing an admin. Fixing...`);
        
        const adminEmail = `admin@${school.slug}.edu`;
        const adminPassword = `Admin${Math.floor(1000 + Math.random() * 9000)}!`;
        
        // 1. Try create or get auth user
        let schoolUserId: string | null = null;
        const { data: sCreateData, error: sCreateError } = await supabase.auth.admin.createUser({
          email: adminEmail, password: adminPassword, email_confirm: true,
        });

        if (sCreateData?.user?.id) {
          schoolUserId = sCreateData.user.id;
          log.push(`   Created new auth user for school admin`);
        } else {
          const { data: sListData } = await supabase.auth.admin.listUsers();
          const existingS = sListData?.users?.find((u) => u.email === adminEmail);
          if (existingS) {
            schoolUserId = existingS.id;
            await supabase.auth.admin.updateUserById(schoolUserId, { password: adminPassword });
            log.push(`   Found existing auth user for school admin, updated password`);
          } else {
             log.push(`   ❌ Failed to create or find auth user for ${school.name}`);
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
           log.push(`   ✅ Provisioned admin: ${adminEmail} / ${adminPassword}`);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: "Provisioning script executed. Check log for details.",
    log,
  });
}
