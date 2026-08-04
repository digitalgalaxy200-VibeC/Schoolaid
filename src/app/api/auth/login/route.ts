import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 5, 60000))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { email: rawEmail, password } = await request.json();
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

  try {
    const supabase = getServiceClient();

    // 1. Find user by email safely using parameterised PostgREST query
    const { data: profiles } = await supabase.from("profiles").select("id, role, school_id, full_name").ilike("email", email);
    
    // To prevent email enumeration, we return the generic invalid message if not found
    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    
    const profile = profiles[0];
    const userId = profile.id;

    // Ensure email is confirmed for admin-created accounts
    await supabase.auth.admin.updateUserById(userId, { email_confirm: true });

    // 2. Verify password using Supabase native auth API
    const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      body: JSON.stringify({ email, password }),
    });

    if (!authRes.ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // 3. Check must_change_password flag
    let mustChange = false;
    const table = profile.role === "teacher" ? "teachers" : profile.role === "student" ? "students" : profile.role === "school_admin" ? "school_admins" : null;
    
    if (table) {
      const { data: roleData } = await supabase.from(table).select("must_change_password").eq("profile_id", userId).maybeSingle();
      mustChange = roleData?.must_change_password ?? false;
    }

    // 4. Issue custom JWT session
    const token = await new SignJWT({ sub: userId, email, role: profile.role, school_id: profile.school_id, full_name: profile.full_name, must_change_password: mustChange })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(getJwtSecret());

    const response = NextResponse.json({ success: true, role: profile.role, redirect: getDashboard(profile.role), must_change_password: mustChange });
    response.cookies.set("schoolaid-session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    response.cookies.set("schoolaid-email", email, { secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    
    return response;
  } catch (err) {
    console.error("Login route error:", err);
    return NextResponse.json({ error: "Login failed due to a system error." }, { status: 500 });
  }
}

function getDashboard(role: string): string {
  switch (role) { 
    case "super_admin": return "/super-admin/dashboard"; 
    case "school_admin": return "/school-admin/dashboard"; 
    case "teacher": return "/teacher/dashboard"; 
    case "student": return "/student/dashboard"; 
    default: return "/"; 
  }
}
