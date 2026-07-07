import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  // Simple security check so random people don't trigger this
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  
  // We use the first 10 chars of your Service Role Key as a quick secure password to trigger this
  const secretKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback").substring(0, 10);
  
  if (key !== secretKey) {
    return NextResponse.json({ 
      error: "Unauthorized.",
      hint: "Add ?key=YOUR_SECRET to the URL. The secret is the first 10 characters of your SUPABASE_SERVICE_ROLE_KEY."
    }, { status: 401 });
  }

  const supabase = getServiceClient();
  const email = "admin@schoolaid.com";
  const password = "Admin123!";

  // 1. Try to create the user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let userId = authData?.user?.id;

  // 2. If user exists, update their password so we guarantee it works
  if (authError) {
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find((u) => u.email === email);
    
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, { password });
      userId = existing.id;
    } else {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  // 3. Upsert the profile
  if (userId) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      email: email,
      full_name: "Super Admin",
      role: "super_admin",
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Super Admin provisioned! You can now log in with ${email} / ${password}` });
  }

  return NextResponse.json({ error: "Failed to get User ID" }, { status: 500 });
}
