import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function verifyViaSupabase(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.user?.id ? (data.user.id as string) : null;
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
    const supabase = getServiceClient();

    // ── Step 1: Look up profile by email (parameterised, safe) ──────────────
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role, school_id, full_name, email")
      .ilike("email", email);

    let profile = profiles?.[0] ?? null;
    let userId = profile?.id ?? null;
    let alreadyVerified = false;

    if (!profile) {
      // ── Step 2: Profile not found by email — maybe email mismatch or profile
      //   was never created. Verify credentials first via Supabase /token.
      //   If valid, find the profile by auth user ID instead. ────────────────
      const verifiedId = await verifyViaSupabase(email, password);
      if (!verifiedId) {
        // Credentials are wrong — return generic message (no enumeration)
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }

      alreadyVerified = true;
      userId = verifiedId;

      // Try to find profile by user ID
      const { data: profileById } = await supabase
        .from("profiles")
        .select("id, role, school_id, full_name, email")
        .eq("id", userId)
        .maybeSingle();

      if (!profileById) {
        // Auth user exists and password is correct, but there is no profile row.
        // This is a data integrity issue — log it and surface a clear message.
        console.error(`[login] Auth user ${userId} (${email}) verified but has no profiles row. Needs investigation.`);
        return NextResponse.json({ error: "Account setup is incomplete. Please contact your school administrator." }, { status: 401 });
      }

      // Profile found by ID — repair the email column so future logins work
      if (profileById.email?.toLowerCase() !== email) {
        await supabase.from("profiles").update({ email }).eq("id", userId);
      }

      profile = { ...profileById, email };
    }

    // ── Step 3: Verify password (skipped if already verified in fallback) ───
    if (!alreadyVerified) {
      // Ensure email_confirmed_at is set (admin-created accounts may skip confirmation)
      await supabase.auth.admin.updateUserById(userId!, { email_confirm: true });

      const verifiedId = await verifyViaSupabase(email, password);
      if (!verifiedId) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    // ── Step 4: Fetch must_change_password flag ──────────────────────────────
    let mustChange = false;
    const table =
      profile.role === "teacher" ? "teachers"
      : profile.role === "student" ? "students"
      : profile.role === "school_admin" ? "school_admins"
      : null;

    if (table) {
      const { data: roleData } = await supabase
        .from(table)
        .select("must_change_password")
        .eq("profile_id", userId)
        .maybeSingle();
      mustChange = roleData?.must_change_password ?? false;
    }

    // ── Step 5: Issue custom JWT session ────────────────────────────────────
    const token = await new SignJWT({
      sub: userId!,
      email,
      role: profile.role,
      school_id: profile.school_id,
      full_name: profile.full_name,
      must_change_password: mustChange,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(getJwtSecret());

    const response = NextResponse.json({
      success: true,
      role: profile.role,
      redirect: getDashboard(profile.role),
      must_change_password: mustChange,
    });

    response.cookies.set("schoolaid-session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400, path: "/" });
    response.cookies.set("schoolaid-email", email, { secure: true, sameSite: "lax", maxAge: 86400, path: "/" });

    return response;
  } catch (err) {
    console.error("[login] Unexpected error:", err);
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
