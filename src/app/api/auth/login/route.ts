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

  const { email, password } = await request.json();
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });

  const esc = (s: string) => s.replace(/'/g, "''");

  try {
    const rows = await query(`SELECT id FROM auth.users WHERE email = '${esc(email)}'`);
    if (!rows?.length) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    const userId = rows[0].id;

    const v = await query(`SELECT (encrypted_password = crypt('${esc(password)}', encrypted_password)) AS valid FROM auth.users WHERE id = '${userId}'`);
    if (!v?.[0]?.valid) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

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
