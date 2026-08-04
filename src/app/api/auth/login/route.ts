import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";

const getJwtSecret = () => new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function verifyViaSupabase(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error("[login] /token verification failed:", JSON.stringify(errBody));
    return null;
  }
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
    let userId: string | null = profile?.id ?? null;
    let alreadyVerified = false;

    console.log(`[login] profiles lookup for "${email}" returned ${profiles?.length ?? 0} rows`);

    // ── Fallback A: Profile not found by email column ────────────────────────
    // Handles migrated accounts where profiles.email may be null or mismatched.
    if (!profile) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const authUser = (users || []).find(u => u.email?.toLowerCase() === email);

      if (authUser) {
        console.log(`[login] Found auth user by email (not in profiles.email): ${authUser.id}`);
        const { data: profileById } = await supabase
          .from("profiles")
          .select("id, role, school_id, full_name, email")
          .eq("id", authUser.id)
          .maybeSingle();

        if (profileById) {
          profile = profileById;
          userId = profileById.id;
          // Repair the email column so future lookups skip this fallback
          await supabase.from("profiles").update({ email }).eq("id", userId);
          console.log(`[login] Repaired profiles.email for user ${userId}`);
        }
      }
    }

    // ── Fallback B: Still no profile — verify credentials first, then find by ID ─
    if (!profile) {
      const verifiedId = await verifyViaSupabase(email, password);
      if (!verifiedId) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }

      alreadyVerified = true;
      userId = verifiedId;

      const { data: profileById } = await supabase
        .from("profiles")
        .select("id, role, school_id, full_name, email")
        .eq("id", userId)
        .maybeSingle();

      if (!profileById) {
        console.error(`[login] Auth user ${userId} (${email}) verified but has no profiles row.`);
        return NextResponse.json({ error: "Account setup is incomplete. Please contact your school administrator." }, { status: 401 });
      }

      // Repair email mismatch
      if (profileById.email?.toLowerCase() !== email) {
        await supabase.from("profiles").update({ email }).eq("id", userId);
      }

      profile = { ...profileById, email };
    }

    // ── Step 2: Verify password (skipped if already verified in Fallback B) ──
    if (!alreadyVerified) {
      // Confirm email for admin-created accounts that may have skipped confirmation
      await supabase.auth.admin.updateUserById(userId!, { email_confirm: true });

      const verifiedId = await verifyViaSupabase(email, password);
      if (!verifiedId) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
    }

    // ── Step 3: Fetch must_change_password flag ──────────────────────────────
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

    // ── Step 4: Issue custom JWT session ────────────────────────────────────
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
