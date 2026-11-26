import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { getJwtSecret } from "@/lib/jwt-secret";
import { profilePath } from "@/lib/auth/profile-completion";
import { loadProfileSnapshot } from "@/lib/auth/profile-snapshot";
import { loadFinanceRole } from "@/lib/finance/permissions";

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  recovery_email: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;

  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());

    const response: Record<string, unknown> = {
      email: payload.email || "",
      role: payload.role || "",
      school_id: payload.school_id || null,
      full_name: payload.full_name || "",
      sub: payload.sub || "",
      impersonated: !!payload.impersonated,
      must_change_password: false,
      // The platform operator has no tenant profile; nothing is gated for it.
      profile_percent: 100,
      profile_complete: true,
      profile_missing: [],
      results_gate: null as number | null,
      results_unlocked: true,
      phone: "",
      contact_email: "",
      gender: "",
      profile_path: null as string | null,
    };

    // Finance capability, for school-admin accounts only. Reading it through the
    // helper means a missing column (migration 084 not applied) answers "admin"
    // instead of failing the whole /me call.
    if (payload.role === "school_admin") {
      response.finance_role = await loadFinanceRole((payload.sub as string) || null);
    }

    // Check must_change_password and get school info
    if (payload.sub && payload.role && payload.school_id) {
      try {
        const supabase = getServiceClient();
        const table =
          payload.role === "student"
            ? "students"
            : payload.role === "teacher"
              ? "teachers"
              : payload.role === "school_admin"
                ? "school_admins"
                : null;

        const impersonated = payload.impersonated === true;

        if (table) {
          const { data: record } = await supabase
            .from(table).select("must_change_password").eq("profile_id", payload.sub).maybeSingle();
          response.must_change_password = record?.must_change_password ?? false;
        }

        // An impersonation token carries the SUPER ADMIN's id in `sub` with the
        // target role. Reading "the teacher's profile" there would read the
        // operator's, so the personal block is skipped entirely. The layouts
        // skip the gate for the same reason.
        if (!impersonated) {
          // One shared loader decides what a profile snapshot is — the phone
          // alone has three possible sources (own, guardian, admin row), and
          // reading only the first is what bounced registered students back to
          // this page on every login.
          const loaded = await loadProfileSnapshot(
            supabase,
            payload.sub as string,
            payload.role as string,
          );

          if (loaded) {
            const { snapshot, assessment } = loaded;
            response.profile_percent = assessment.percent;
            response.profile_gate = assessment.gate;
            response.profile_complete = assessment.complete;
            response.profile_missing = assessment.missing;
            response.results_gate = assessment.resultsGate;
            response.results_unlocked = assessment.resultsUnlocked;
            response.profile_path = profilePath(payload.role as string);
            response.profile_full_name = snapshot.full_name ?? "";
            response.phone = snapshot.phone ?? "";
            response.contact_email = snapshot.contact_email ?? "";
            response.gender = snapshot.gender ?? "";
            response.date_of_birth = snapshot.date_of_birth ?? "";
            response.emergency_contact = snapshot.emergency_contact ?? "";
            response.parent_location = snapshot.parent_location ?? "";
            response.allergies = snapshot.allergies ?? "";
            response.blood_group = snapshot.blood_group ?? "";
            response.health_notes = snapshot.health_notes ?? "";
            response.nationality = snapshot.nationality ?? "";
            response.parent_occupation = snapshot.parent_occupation ?? "";
            response.religion = snapshot.religion ?? "";
            response.photo_url = snapshot.photo ?? "";
          }
        }

        const { data: schoolData } = await supabase
          .from("schools").select("name, logo_url, slug").eq("id", payload.school_id).single();
        if (schoolData) {
          response.school_name = schoolData.name;
          response.school_logo = schoolData.logo_url || null;
          response.school_slug = schoolData.slug;
        }
      } catch {
        response.must_change_password = false;
      }
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
