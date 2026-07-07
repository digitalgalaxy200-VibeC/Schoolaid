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

  const email = "admin@schoolaid.com";
  const password = "Admin123!";
  const log: string[] = [];

  // Step 1: Try create user
  let userId: string | null = null;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createData?.user?.id) {
    userId = createData.user.id;
    log.push(`✅ Created new auth user: ${userId}`);
  } else {
    log.push(`ℹ️ Create failed (${createError?.message}), trying to find existing user...`);

    // Step 2: Find existing user and reset password
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message, log }, { status: 500 });
    }

    const existing = listData?.users?.find((u) => u.email === email);
    if (!existing) {
      return NextResponse.json({ error: "Could not create or find user.", log }, { status: 500 });
    }

    userId = existing.id;
    log.push(`✅ Found existing user: ${userId}`);

    // Reset their password via admin SDK (properly hashed)
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      log.push(`⚠️ Password update failed: ${updateError.message}`);
    } else {
      log.push(`✅ Password reset successfully`);
    }
  }

  // Step 3: Upsert profile with super_admin role
  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: userId, email, full_name: "Super Admin", role: "super_admin" },
    { onConflict: "id" }
  );

  if (profileError) {
    log.push(`⚠️ Profile upsert failed: ${profileError.message} — trying update instead...`);

    // Fallback: just update role directly
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({ role: "super_admin", full_name: "Super Admin" })
      .eq("id", userId);

    if (updateProfileError) {
      log.push(`❌ Profile update also failed: ${updateProfileError.message}`);
      return NextResponse.json({ error: "Profile could not be updated", log }, { status: 500 });
    }
    log.push(`✅ Profile role updated to super_admin via UPDATE`);
  } else {
    log.push(`✅ Profile upserted with super_admin role`);
  }

  return NextResponse.json({
    success: true,
    message: `Done! Log in with: ${email} / ${password}`,
    log,
  });
}
