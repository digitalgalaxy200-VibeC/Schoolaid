import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { escapeLikePattern, normaliseAccountEmail } from "@/lib/account/email";

/**
 * PUT /api/school-admin/account/email — change the email a school admin SIGNS IN with.
 *
 * WHY THIS IS NOT THE SCHOOL'S EMAIL
 * ----------------------------------
 * The School Profile screen already edits `schools.email`, which is the school's
 * public contact address. This route changes `profiles.email` AND the Supabase
 * Auth identity, because login looks the account up by profile email and then
 * authenticates against Auth. Changing one without the other leaves an account
 * that cannot sign in.
 *
 * WHY THE CURRENT PASSWORD IS REQUIRED
 * ------------------------------------
 * An email address is half of a credential. A hijacked session that could change
 * it would be able to take the account over and lock the owner out. Proving the
 * password first means a stolen cookie is not enough.
 *
 * ORDER MATTERS: Auth first, then the profile. If Auth refuses (address already
 * taken, malformed), nothing in our tables has changed.
 */

export async function PUT(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = normaliseAccountEmail(body.email);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const email = parsed.email;
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (!currentPassword) {
    return NextResponse.json(
      { error: "Enter your current password to confirm the change." },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Could not read your account." }, { status: 500 });
  }
  if (profile.role !== "school_admin") {
    return NextResponse.json(
      { error: "Only a school administrator can change an email here." },
      { status: 403 },
    );
  }

  const currentEmail = (profile.email as string | null)?.trim() ?? "";
  if (!currentEmail) {
    return NextResponse.json(
      {
        error:
          "This account has no email on file. Ask SchoolAid to set one before changing it here.",
      },
      { status: 400 },
    );
  }
  if (currentEmail.toLowerCase() === email) {
    return NextResponse.json(
      { error: "That is already your email address." },
      { status: 400 },
    );
  }

  // 1. Prove it is the person, not just the session.
  const tokenUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const verify = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({ email: currentEmail, password: currentPassword }),
  }).catch(() => null);

  if (!verify?.ok) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  // 2. Refuse an address another account already uses. The Auth call below would
  //    also refuse it, but a named answer is more useful than an upstream string.
  const { data: clash } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", escapeLikePattern(email))
    .neq("id", userId)
    .limit(1);

  if (clash && clash.length > 0) {
    return NextResponse.json(
      { error: "That email is already used by another account." },
      { status: 409 },
    );
  }

  // 3. Auth identity first.
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (authError) {
    const message = /already|exists|registered|duplicate/i.test(authError.message)
      ? "That email is already used by another account."
      : authError.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // 4. Mirror it in `profiles`, which is what login reads first.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ email })
    .eq("id", userId);

  if (updateError) {
    // The sign-in address HAS changed; only our copy lags. The login route
    // repairs this from Auth on the next sign-in, so say what is true.
    console.error("[account/email] auth updated but profiles update failed:", updateError.message);
    return NextResponse.json({
      email,
      warning:
        "Your sign-in email changed. The profile copy could not be updated and will be repaired at your next sign-in.",
    });
  }

  // 5. Re-issue the session so the header and /api/auth/me show the new address
  //    without forcing a sign-out. Every other claim is carried over untouched.
  const response = NextResponse.json({ email });

  const session = (await cookies()).get("schoolaid-session")?.value;
  if (session) {
    try {
      const { payload } = await jwtVerify(session, getJwtSecret());
      // Carry every claim over, replacing only the address. The issued-at and
      // expiry are re-set below, so they must not be copied.
      const claims: Record<string, unknown> = { ...payload };
      delete claims.iat;
      delete claims.exp;
      delete claims.nbf;
      claims.email = email;
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(getJwtSecret());

      response.cookies.set("schoolaid-session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 86400,
        path: "/",
      });
    } catch {
      // A cookie we cannot re-sign is not a failed change: the new address works
      // from the next sign-in. Do not report the change as unsuccessful.
      console.warn("[account/email] could not refresh the session cookie");
    }
  }

  // 6. Audit. Best effort: this table has been absent in this database before.
  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: userId,
    school_id,
    event: "email_changed",
    ip_address: request.headers.get("x-forwarded-for") || "",
  });
  if (auditError) console.warn("[account/email] audit insert failed:", auditError.message);

  return response;
}
