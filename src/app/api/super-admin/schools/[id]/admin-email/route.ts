import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { escapeLikePattern, normaliseAccountEmail } from "@/lib/account/email";
import { setAuthUserEmail } from "@/lib/supabase/auth-users";

/**
 * POST /api/super-admin/schools/[id]/admin-email
 *
 * Replaces ONE school administrator's sign-in email. Super-Admin-only.
 *
 * WHY THIS EXISTS
 * ---------------
 * A school is provisioned with a generated address (`admin@<slug>.edu`) that
 * nobody owns — it exists only to get the account created. The school then sets
 * its real address, and the generated one must be REPLACED everywhere: the Auth
 * identity, `profiles.email`, and the school's own contact email while that still
 * holds the generated value. Leaving any of them behind is what made a school
 * appear to sign in with an address it had already abandoned.
 *
 * No current password is asked for here: this is the platform operator acting on
 * a tenant record, the same authority the reset-password route already uses.
 * The school's own self-service path (`/api/school-admin/account/email`) does
 * require the password, because there the actor is the account holder.
 */

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id: schoolIdOrSlug } = await params;

  const column = isUUID(schoolIdOrSlug) ? "id" : "slug";
  const { data: school } = await supabase
    .from("schools")
    .select("id, slug, email")
    .eq(column, schoolIdOrSlug)
    .single();

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const adminId = typeof body.admin_id === "string" ? body.admin_id : "";
  if (!adminId) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 });
  }

  const parsed = normaliseAccountEmail(body.email);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const email = parsed.email;

  // Tenant guard: the administrator must belong to THIS school.
  const { data: admin } = await supabase
    .from("school_admins")
    .select("id, profile_id")
    .eq("id", adminId)
    .eq("school_id", school.id)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found in this school" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", admin.profile_id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const previousEmail = (profile.email as string | null)?.trim() ?? "";
  if (previousEmail.toLowerCase() === email) {
    return NextResponse.json(
      { error: "That is already this administrator's sign-in email." },
      { status: 400 },
    );
  }

  // Refuse an address another profile already uses. Auth would also refuse it,
  // but a named answer beats an upstream string.
  const { data: clash } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", escapeLikePattern(email))
    .neq("id", profile.id)
    .limit(1);

  if (clash && clash.length > 0) {
    return NextResponse.json(
      { error: "That email is already used by another account." },
      { status: 409 },
    );
  }

  // 1. Auth identity first: the old address stops authenticating when this
  //    succeeds, and nothing in our tables has changed if it fails.
  const auth = await setAuthUserEmail(profile.id, email);
  if (!auth.ok) {
    if (auth.reason === "duplicate") {
      return NextResponse.json(
        { error: "That email is already used by another account." },
        { status: 409 },
      );
    }
    if (auth.reason === "missing") {
      return NextResponse.json(
        { error: "This administrator has no working sign-in account. Reset the password to recreate it." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "The authentication service refused the change. Please try again." },
      { status: 500 },
    );
  }

  // 2. Our copy of the address.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email })
    .eq("id", profile.id);

  if (profileError) {
    console.error("[admin-email] auth updated but profiles update failed:", profileError.message);
    return NextResponse.json({
      email,
      warning:
        "The sign-in email changed. The profile copy could not be updated and will be repaired at the next sign-in.",
    });
  }

  // 3. The school's contact email follows only while it has never been chosen
  //    deliberately — it still holds the old sign-in address, or the generated
  //    `admin@<slug>.edu` placeholder.
  let schoolEmailUpdated = false;
  const storedSchoolEmail = (school.email as string | null)?.trim() ?? "";
  const generated = `admin@${school.slug}.edu`.toLowerCase();
  const neverChosen =
    storedSchoolEmail.toLowerCase() === previousEmail.toLowerCase() ||
    storedSchoolEmail.toLowerCase() === generated;

  if (neverChosen) {
    const { error: schoolError } = await supabase
      .from("schools")
      .update({ email })
      .eq("id", school.id);
    if (schoolError) {
      console.warn("[admin-email] school contact email not updated:", schoolError.message);
    } else {
      schoolEmailUpdated = true;
    }
  }

  // 4. Audit. Best effort: this table has been absent in this database before.
  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: profile.id,
    school_id: school.id,
    event: "email_changed",
    ip_address: request.headers.get("x-forwarded-for") || "",
  });
  if (auditError) console.warn("[admin-email] audit insert failed:", auditError.message);

  return NextResponse.json({
    email,
    previous_email: previousEmail,
    school_email_updated: schoolEmailUpdated,
  });
}
