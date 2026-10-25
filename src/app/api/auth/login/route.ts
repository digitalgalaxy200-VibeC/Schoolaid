import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";
import {
  checkRateLimit,
  clearRateLimit,
  clientIp,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  rateLimitState,
  tooManyAttemptsResponse,
} from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase/service";
import { assessProfile, profilePath } from "@/lib/auth/profile-completion";

/**
 * Brute-force protection, in two buckets and with one rule about what counts.
 *
 * FIVE FAILURES PER ACCOUNT PER ADDRESS. Keying on the address alone locked out
 * a whole school, because a school shares one connection — and so does everyone
 * behind a carrier's NAT. Keying on the account alone lets one person's typos
 * lock out their colleagues sharing that account's login page.
 *
 * THIRTY FAILURES PER ADDRESS, as a backstop: without it, an attacker sidesteps
 * the per-account bucket by rotating the email address.
 *
 * ONLY FAILURES ARE COUNTED. Every request used to count, so the sixth teacher
 * arriving at 8am was refused while typing the correct password.
 */
const LOGIN_FAILURES_PER_ACCOUNT = 5;
const LOGIN_FAILURES_PER_ADDRESS = 30;
/** Malformed bodies have no account to attribute them to, so they get their own,
 *  smaller per-address ceiling. */
const LOGIN_INVALID_BODIES_PER_ADDRESS = 20;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
  const ip = clientIp(request);

  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = (body?.email || "").trim().toLowerCase();
  const password = body?.password || "";

  if (!email || !password) {
    if (
      !(await checkRateLimit(
        `login-invalid:${ip}`,
        LOGIN_INVALID_BODIES_PER_ADDRESS,
        DEFAULT_RATE_LIMIT_WINDOW_MS,
      ))
    ) {
      return tooManyAttemptsResponse(Math.ceil(DEFAULT_RATE_LIMIT_WINDOW_MS / 1000));
    }
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const accountKey = `login:${ip}:${email}`;
  const addressKey = `login-address:${ip}`;

  // Asked BEFORE any lookup or password check, so a blocked caller costs nothing
  // and cannot be used to probe whether an account exists.
  const [account, address] = await Promise.all([
    rateLimitState(accountKey, LOGIN_FAILURES_PER_ACCOUNT),
    rateLimitState(addressKey, LOGIN_FAILURES_PER_ADDRESS),
  ]);
  if (account.blocked || address.blocked) {
    return tooManyAttemptsResponse(
      Math.max(account.retryAfterSeconds, address.retryAfterSeconds),
    );
  }

  /** Called only where the credentials were actually wrong. */
  const recordFailure = async (): Promise<void> => {
    await Promise.all([
      checkRateLimit(accountKey, LOGIN_FAILURES_PER_ACCOUNT, DEFAULT_RATE_LIMIT_WINDOW_MS),
      checkRateLimit(addressKey, LOGIN_FAILURES_PER_ADDRESS, DEFAULT_RATE_LIMIT_WINDOW_MS),
    ]);
  };

  try {
    const supabase = getServiceClient();

    // ── Step 1: Look up profile by email ────────────────────────────────────
    // Escape LIKE wildcards first: an email containing % or _ would otherwise
    // widen the match and could return an unrelated account.
    const escapedEmail = email.replace(/([\\%_])/g, "\\$1");

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role, school_id, full_name, email")
      .ilike("email", escapedEmail);

    // An ambiguous match must never be resolved by silently taking the first
    // row — that risks authenticating the wrong account.
    if (profiles && profiles.length > 1) {
      console.error(`[login] ambiguous email: ${profiles.length} profiles match "${email}"`);
      return NextResponse.json(
        { error: "Multiple accounts match this email. Please contact your school administrator." },
        { status: 409 },
      );
    }

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
        await recordFailure();
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
      const verifiedId = await verifyViaSupabase(email, password);
      if (!verifiedId) {
        await recordFailure();
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      // Only AFTER the password is confirmed correct do we confirm the email
      // for admin-created accounts that may have skipped confirmation — a
      // wrong-password attempt must never mutate account state.
      await supabase.auth.admin.updateUserById(userId!, { email_confirm: true });
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
        .select("must_change_password, generated_password")
        .eq("profile_id", userId)
        .maybeSingle();
      mustChange = roleData?.must_change_password ?? false;

      // The generated password has now served its one-time purpose: it was shown
      // to the administrator who created the account. Clear it so a database
      // dump can never yield a working credential.
      if (roleData?.generated_password) {
        await supabase.from(table).update({ generated_password: null }).eq("profile_id", userId);
      }
    }

    // ── Step 3b: Is the profile complete enough to work? ────────────────────
    // Only after the password is confirmed. A temporary password comes first:
    // while `mustChange` is set the client keeps the dashboard target and
    // middleware diverts it to /change-password, so the profile prompt appears
    // on the sign-in AFTER a real password exists.
    let profileComplete = true;
    const roleProfilePath = profilePath(profile.role);
    if (roleProfilePath && profile.school_id) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("full_name, phone, recovery_email")
        .eq("id", userId)
        .maybeSingle();

      let gender: string | null = null;
      if (profile.role === "teacher" || profile.role === "student") {
        const { data: roleRow } = await supabase
          .from(profile.role === "teacher" ? "teachers" : "students")
          .select("gender")
          .eq("profile_id", userId)
          .maybeSingle();
        gender = (roleRow as { gender?: string | null } | null)?.gender ?? null;
      }

      const stored = profileRow as {
        full_name: string | null;
        phone: string | null;
        recovery_email: string | null;
      } | null;

      profileComplete = assessProfile(profile.role, {
        full_name: stored?.full_name ?? profile.full_name,
        phone: stored?.phone ?? null,
        contact_email: stored?.recovery_email ?? null,
        gender,
      }).complete;
    }

    // ── Step 4: Issue custom JWT session ────────────────────────────────────
    // Correct password: forget the typos that preceded it. The address bucket
    // is left alone — it accounts for other people on the same connection.
    await clearRateLimit(accountKey);

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
      // An incomplete profile is sent to its own page instead of the dashboard.
      // A temporary password is handled first (above), so this prompt appears
      // on the sign-in after the user has chosen a real password.
      redirect:
        !mustChange && !profileComplete && roleProfilePath
          ? roleProfilePath
          : getDashboard(profile.role),
      must_change_password: mustChange,
      profile_complete: profileComplete,
    });

    response.cookies.set("schoolaid-session", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400, path: "/" }); // 24 hours

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
