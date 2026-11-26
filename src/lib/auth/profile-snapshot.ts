import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessProfile,
  type ProfileAssessment,
  type ProfileSnapshot,
} from "./profile-completion";

/**
 * Loads a person's profile from the three tables it is spread across, and scores
 * it. The ONE place that decides what a profile snapshot is.
 *
 * WHY A SHARED LOADER
 * -------------------
 * Three endpoints score the same person: `/api/auth/me` (renders), `/api/auth/login`
 * (decides the landing page) and `/api/auth/profile` (scores the save). When each
 * built its own snapshot they drifted, and the drift was expensive: login read
 * only `profiles.phone` while the school's number sat in `students.parent_phone`,
 * so every registered student was sent to the profile page they had already
 * filled in.
 *
 * THE PHONE IS ONE SLOT WITH SEVERAL SOURCES
 * ------------------------------------------
 *   student       profiles.phone  →  students.parent_phone
 *   school admin  profiles.phone  →  school_admins.phone
 *   teacher       profiles.phone
 *
 * The first value found is used once. A guardian number the school took at
 * registration is a real way to reach the family, so it counts as the student's
 * number rather than being ignored.
 */

type Row = Record<string, unknown>;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const STUDENT_COLUMNS =
  "date_of_birth, gender, photo_url, parent_phone, emergency_contact, parent_location, " +
  "allergies, blood_group, health_notes, nationality, parent_occupation, religion";

const TEACHER_COLUMNS = "date_of_birth, gender, photo_url";

export type LoadedProfile = {
  snapshot: ProfileSnapshot;
  assessment: ProfileAssessment;
  /** True when the person's role row exists at all (a student row for a student). */
  hasRoleRow: boolean;
};

export async function loadProfileSnapshot(
  supabase: SupabaseClient,
  userId: string,
  role: string,
): Promise<LoadedProfile | null> {
  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, email, phone, recovery_email")
    .eq("id", userId)
    .maybeSingle();

  if (!profileData) return null;
  const profile = profileData as Row;

  let student: Row | null = null;
  let teacher: Row | null = null;
  let admin: Row | null = null;

  if (role === "student") {
    const { data } = await supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .eq("profile_id", userId)
      .maybeSingle();
    student = (data as Row | null) ?? null;
  } else if (role === "teacher") {
    const { data } = await supabase
      .from("teachers")
      .select(TEACHER_COLUMNS)
      .eq("profile_id", userId)
      .maybeSingle();
    teacher = (data as Row | null) ?? null;
  } else if (role === "school_admin") {
    const { data } = await supabase
      .from("school_admins")
      .select("phone")
      .eq("profile_id", userId)
      .maybeSingle();
    admin = (data as Row | null) ?? null;
  }

  const phone =
    str(profile.phone) ??
    str(student?.parent_phone) ??
    str(admin?.phone) ??
    null;

  const snapshot: ProfileSnapshot = {
    full_name: str(profile.full_name),
    phone,
    // A school admin signs in with the email that reaches them; everyone else
    // has a separate contact address.
    contact_email: role === "school_admin" ? str(profile.email) : str(profile.recovery_email),
    gender: str(student?.gender) ?? str(teacher?.gender),
    date_of_birth: str(student?.date_of_birth) ?? str(teacher?.date_of_birth),
    photo: str(student?.photo_url) ?? str(teacher?.photo_url),
    emergency_contact: str(student?.emergency_contact),
    parent_location: str(student?.parent_location),
    allergies: str(student?.allergies),
    blood_group: str(student?.blood_group),
    health_notes: str(student?.health_notes),
    nationality: str(student?.nationality),
    parent_occupation: str(student?.parent_occupation),
    religion: str(student?.religion),
  };

  const hasRoleRow = role === "student" ? student !== null : role === "teacher" ? teacher !== null : true;

  return { snapshot, assessment: assessProfile(role, snapshot), hasRoleRow };
}
