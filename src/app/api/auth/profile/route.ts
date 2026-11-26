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
  editableProfileFields,
  FIELD_TABLE,
  PROFILE_FIELDS,
  type ProfileField,
} from "@/lib/auth/profile-completion";
import { loadProfileSnapshot } from "@/lib/auth/profile-snapshot";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9()\s.-]{7,20}$/;
const GENDERS = new Set(["male", "female"]);

type ProfileRow = {
  full_name: string | null;
  email: string | null;
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

    // A field this role may not write is DROPPED, not applied and not an
    // error: a stale tab may still post a field the form no longer shows, and a
    // silent refusal that returns the stored truth is kinder than a failed save.
    const ignored = PROFILE_FIELDS.filter(
      (field) => body[field] !== undefined && !mayEdit(field),
    );
    if (ignored.length > 0) {
      console.warn(`[auth/profile] ignoring ${ignored.join(", ")} for role ${role}`);
    }

    const profileUpdate: Record<string, string | null> = {};
    // Fields that live on `students`. Collected here and written once, so a
    // save that fills in five details is one statement, not five.
    const studentUpdate: Record<string, string | null> = {};
    const STUDENT_TEXT_FIELDS: ProfileField[] = [
      "parent_location",
      "allergies",
      "blood_group",
      "health_notes",
      "nationality",
      "parent_occupation",
      "religion",
    ];
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

    if (mayEdit("date_of_birth") && body.date_of_birth !== undefined) {
      const value = typeof body.date_of_birth === "string" ? body.date_of_birth.trim() : "";
      if (value && !DATE_RE.test(value)) return bad("Enter your date of birth as YYYY-MM-DD.");
      studentUpdate.date_of_birth = value || null;
    }

    if (mayEdit("emergency_contact") && body.emergency_contact !== undefined) {
      const value = typeof body.emergency_contact === "string" ? body.emergency_contact.trim() : "";
      if (value && !PHONE_RE.test(value)) {
        return bad("Enter an emergency number we can dial, e.g. 0803 123 4567.");
      }
      studentUpdate.emergency_contact = value || null;
    }

    for (const field of STUDENT_TEXT_FIELDS) {
      if (!mayEdit(field) || body[field] === undefined) continue;
      const value = typeof body[field] === "string" ? (body[field] as string).trim() : "";
      if (value.length > 120) return bad(`Keep ${field.replace(/_/g, " ")} under 120 characters.`);
      // Every one of these is optional; clearing it is a legitimate save.
      if (FIELD_TABLE[field] === "students") studentUpdate[field] = value || null;
    }

    const supabase = getServiceClient();

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (gender !== undefined) {
      const table = role === "teacher" ? "teachers" : role === "student" ? "students" : null;
      if (table === "students") studentUpdate.gender = gender;
    }

    if (Object.keys(studentUpdate).length > 0 && role === "student") {
      let query = supabase.from("students").update(studentUpdate).eq("profile_id", userId);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (gender !== undefined && role === "teacher") {
      let query = supabase.from("teachers").update({ gender }).eq("profile_id", userId);
      if (schoolId) query = query.eq("school_id", schoolId);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Re-read through the shared loader and score it. The client's copy of the
    // score is never trusted — the gate has to survive a crafted request — and
    // one loader means this cannot disagree with what login and /me decide.
    const loaded = await loadProfileSnapshot(supabase, userId, role);
    if (!loaded) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

    const { snapshot, assessment } = loaded;

    return NextResponse.json({
      success: true,
      profile_percent: assessment.percent,
      profile_gate: assessment.gate,
      profile_complete: assessment.complete,
      profile_missing: assessment.missing,
      results_gate: assessment.resultsGate,
      results_unlocked: assessment.resultsUnlocked,
      full_name: snapshot.full_name ?? "",
      phone: snapshot.phone ?? "",
      contact_email: snapshot.contact_email ?? "",
      gender: snapshot.gender ?? "",
      date_of_birth: snapshot.date_of_birth ?? "",
      emergency_contact: snapshot.emergency_contact ?? "",
      parent_location: snapshot.parent_location ?? "",
      allergies: snapshot.allergies ?? "",
      blood_group: snapshot.blood_group ?? "",
      health_notes: snapshot.health_notes ?? "",
      nationality: snapshot.nationality ?? "",
      parent_occupation: snapshot.parent_occupation ?? "",
      religion: snapshot.religion ?? "",
    });
  } catch (err) {
    console.error("[auth/profile] update failed:", err);
    return NextResponse.json(
      { error: "Could not save your profile. Please try again." },
      { status: 500 },
    );
  }
}
