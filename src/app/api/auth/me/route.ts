import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { getJwtSecret } from "@/lib/jwt-secret";
import { assessProfile, profilePath } from "@/lib/auth/profile-completion";

type ProfileRow = {
  full_name: string | null;
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
      phone: "",
      contact_email: "",
      gender: "",
      profile_path: null as string | null,
    };

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
        let gender: string | null = null;

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
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("full_name, phone, recovery_email")
            .eq("id", payload.sub)
            .maybeSingle();

          // School admins are institutions: `school_admins` has no gender
          // column, so it is never read (or asked for) on that role.
          if (table === "teachers" || table === "students") {
            const { data: roleRow } = await supabase
              .from(table).select("gender").eq("profile_id", payload.sub).maybeSingle();
            gender = (roleRow as { gender?: string | null } | null)?.gender ?? null;
          }

          const profile = profileRow as ProfileRow | null;
          const snapshot = {
            full_name: profile?.full_name ?? (payload.full_name as string) ?? "",
            phone: profile?.phone ?? null,
            contact_email: profile?.recovery_email ?? null,
            gender,
          };
          const assessment = assessProfile(payload.role as string, snapshot);

          response.profile_percent = assessment.percent;
          response.profile_complete = assessment.complete;
          response.profile_missing = assessment.missing;
          response.profile_path = profilePath(payload.role as string);
          response.phone = snapshot.phone ?? "";
          response.contact_email = snapshot.contact_email ?? "";
          response.gender = snapshot.gender ?? "";
          response.profile_full_name = snapshot.full_name;
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
