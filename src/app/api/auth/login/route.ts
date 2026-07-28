import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const MGMT = "https://api.supabase.com/v1/projects/iojiahkehnijxxczrgft/database/query";

async function query(sql: string) {
  const r = await fetch(MGMT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, body: JSON.stringify({ query: sql }) });
  return r.json();
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 5, 60000))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { email: rawEmail, password } = await request.json();
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

  try {
    const esc = (s: string) => s.replace(/'/g, "''");
    const rows = await query(`SELECT id, encrypted_password FROM auth.users WHERE email = '${esc(email)}'`);
    if (!rows?.length) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    const userId = rows[0].id;
    const hash = rows[0].encrypted_password;

    let isValid = false;

    // 1. Try SQL crypt (works for bcrypt)
    const v = await query(`SELECT (encrypted_password = crypt('${esc(password)}', encrypted_password)) AS valid FROM auth.users WHERE id = '${userId}'`);
    if (v?.[0]?.valid) {
      isValid = true;
    }

    // 2. Fallback to Supabase API (required for argon2id hashes or if SQL check fails)
    if (!isValid) {
      // Temporarily confirm email to ensure API works if it was just an unconfirmed email issue
      await query(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${userId}' AND email_confirmed_at IS NULL`);
      
      const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ email, password }),
      });
      if (authRes.ok) isValid = true;
    }

    if (!isValid) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

    const p = await query(`SELECT role, school_id, full_name FROM profiles WHERE id = '${userId}'`);
    const profile = p?.[0];
    if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 401 });

    let mustChange = false;
    if (profile.role === "teacher") { const r = await query(`SELECT must_change_password FROM teachers WHERE profile_id = '${userId}'`); mustChange = r?.[0]?.must_change_password ?? false; }
    else if (profile.role === "student") { const r = await query(`SELECT must_change_password FROM students WHERE profile_id = '${userId}'`); mustChange = r?.[0]?.must_change_password ?? false; }
    else if (profile.role === "school_admin") { const r = await query(`SELECT must_change_password FROM school_admins WHERE profile_id = '${userId}'`); mustChange = r?.[0]?.must_change_password ?? false; }

    const token = await new SignJWT({ sub: userId, email, role: profile.role, school_id: profile.school_id, full_name: profile.full_name, must_change_password: mustChange })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(getJwtSecret());

    const response = NextResponse.json({ success: true, role: profile.role, redirect: getDashboard(profile.role), must_change_password: mustChange });
    response.cookies.set("schoolaid-session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    response.cookies.set("schoolaid-email", email, { secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

function getDashboard(role: string): string {
  switch (role) { case "super_admin": return "/super-admin/dashboard"; case "school_admin": return "/school-admin/dashboard"; case "teacher": return "/teacher/dashboard"; case "student": return "/student/dashboard"; default: return "/"; }
}
