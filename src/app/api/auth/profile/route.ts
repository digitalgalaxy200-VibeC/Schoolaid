// ============================================================
// PUT /api/auth/profile — the completion fields for the signed-in user.
//
// Writes only what a profile form owns:
//   profiles.full_name, profiles.phone, profiles.recovery_email
//   teachers.gender / students.gender   (school admins are institutions — no gender)
//
// It deliberately CANNOT touch:
//   profiles.email  — that is the sign-in identity, changed through its own
//                     flow with the current password;
//   profiles.role / profiles.school_id — identity, never form data;
//   anything verification-shaped — no delivery service is configured, so the
//                     contact email stays unverified and is never advertised as
//                     usable for password recovery yet.
//
// The tenant comes from the session, never from the request body.
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { getJwtSecret } from "@/lib/jwt-secret";
import {
  assessProfile,
  editableProfileFields,
  type ProfileField,
  type ProfileSnapshot,
} from "@/lib/auth/profile-completion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9()\s.-]{7,20}$/;
const GENDERS = new Set(["male", "female"]);

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  recovery_email: string | null;
};

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    const userId = payload.sub as string | undefined;
    const role = payload.role as string | undefined;
    const schoolId = (payload.school_id as string | undefined) ?? null;

    if (!userId || !role) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    // An impersonation token carries the SUPER ADMIN's id with the target role.
    // Saving here would write the operator's profile, so it is refused outright.
    if (payload.impersonated === true) {
      return NextResponse.json(
        { error: "This is a support session. Profile changes belong to the account holder." },
        { status: 403 },
      );
    }

    const editable = editableProfileFields(role);
    if (editable.length === 0) {
      return NextResponse.json(
        { error: "This account has no editable profile." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const mayEdit = (field: ProfileField) => editable.includes(field);

    const profileUpdate: Record<string, string | null> = {};
    let gender: string | null | undefined;

    if (mayEdit("full_name") && body.full_name !== undefined) {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (fullName.length < 2 || fullName.length > 120) {
        return bad("Enter your full name (2 to 120 characters).");
      }
      profileUpdate.full_name = fullName;
    }

    if (mayEdit("phone") && body.phone !== undefined) {
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      if (phone && !PHONE_RE.test(phone)) {
        return bad("Enter a phone number we can dial, e.g. 0803 123 4567 or +234 803 123 4567.");
      }
      profileUpdate.phone = phone || null;
    }

    if (mayEdit("contact_email") && body.contact_email !== undefined) {
      const contactEmail =
        typeof body.contact_email === "string" ? body.contact_email.trim().toLowerCase() : "";
      if (contactEmail && (contactEmail.length > 254 || !EMAIL_RE.test(contactEmail))) {
        return bad("Enter a valid contact email address.");
      }
      // Stored as a CONTACT address. It is not the sign-in identity and is not
      // marked verified: no delivery service is configured yet.
      profileUpdate.recovery_email = contactEmail || null;
    }

    if (mayEdit("gender") && body.gender !== undefined) {
      const value = typeof body.gender === "string" ? body.gender.trim().toLowerCase() : "";
      if (value && !GENDERS.has(value)) return bad("Select Male or Female.");
      gender = value || null;
    }

    const supabase = getServiceClient();

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (gender !== undefined) {
      const table = role === "teacher" ? "teachers" : role === "student" ? "students" : null;
      if (table) {
        let query = supabase.from(table).update({ gender }).eq("profile_id", userId);
        if (schoolId) query = query.eq("school_id", schoolId);
        const { error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Read the stored values back and score them. The client's copy of the
    // score is never trusted — the gate has to survive a crafted request.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("full_name, phone, recovery_email")
      .eq("id", userId)
      .maybeSingle();

    let storedGender: string | null = null;
    if (role === "teacher" || role === "student") {
      const { data: roleRow } = await supabase
        .from(role === "teacher" ? "teachers" : "students")
        .select("gender")
        .eq("profile_id", userId)
        .maybeSingle();
      storedGender = (roleRow as { gender?: string | null } | null)?.gender ?? null;
    }

    const profile = profileRow as ProfileRow | null;
    const snapshot: ProfileSnapshot = {
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
      contact_email: profile?.recovery_email ?? null,
      gender: storedGender,
    };
    const assessment = assessProfile(role, snapshot);

    return NextResponse.json({
      success: true,
      profile_percent: assessment.percent,
      profile_complete: assessment.complete,
      profile_missing: assessment.missing,
      full_name: snapshot.full_name ?? "",
      phone: snapshot.phone ?? "",
      contact_email: snapshot.contact_email ?? "",
      gender: snapshot.gender ?? "",
    });
  } catch (err) {
    console.error("[auth/profile] update failed:", err);
    return NextResponse.json(
      { error: "Could not save your profile. Please try again." },
      { status: 500 },
    );
  }
}
