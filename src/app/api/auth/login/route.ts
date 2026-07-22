import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 5, 60000))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const serviceSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  try {
    // Try GoTrue first (anon key)
    const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: authData } = await anonClient.auth.signInWithPassword({ email, password });
    let userId = authData?.user?.id;

    // Fallback: GoTrue broken -> check user exists via admin API
    if (!userId) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` },
      });
      const data = await res.json();
      const users = data.users || data || [];
      const match = Array.isArray(users) ? users.find((u:any) => u.email === email) : null;
      if (match) userId = match.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Look up profile
    const { data: profile } = await serviceSupabase.from("profiles").select("role, school_id, full_name").eq("id", userId).single();
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 401 });

    // Check must_change_password
    let mustChange = false;
    if (profile.role === "teacher") {
      const { data: t } = await serviceSupabase.from("teachers").select("must_change_password").eq("profile_id", userId).single();
      mustChange = t?.must_change_password ?? false;
    } else if (profile.role === "student") {
      const { data: s } = await serviceSupabase.from("students").select("must_change_password").eq("profile_id", userId).single();
      mustChange = s?.must_change_password ?? false;
    }

    // Audit log
    await serviceSupabase.from("audit_logs").insert({ user_id: userId, school_id: profile.school_id, event: "login_success", ip_address: ip, user_agent: request.headers.get("user-agent") || "" });

    // JWT
    const token = await new SignJWT({ sub: userId, email, role: profile.role, school_id: profile.school_id, full_name: profile.full_name, must_change_password: mustChange })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(getJwtSecret());

    const response = NextResponse.json({ success: true, role: profile.role, redirect: getDashboardPath(profile.role), must_change_password: mustChange });
    response.cookies.set("schoolaid-session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    response.cookies.set("schoolaid-email", email, { secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    return response;
  } catch {
    try { await serviceSupabase.from("audit_logs").insert({ event: "login_failed", ip_address: ip, user_agent: request.headers.get("user-agent") || "" }); } catch {}
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

function getDashboardPath(role: string): string {
  switch (role) { case "super_admin": return "/super-admin/dashboard"; case "school_admin": return "/school-admin/dashboard"; case "teacher": return "/teacher/dashboard"; case "student": return "/student/dashboard"; default: return "/"; }
}
