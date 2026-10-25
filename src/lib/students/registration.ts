import { getServiceClient } from "@/lib/supabase/service";

/**
 * Student provisioning, shared by the school-admin and class-teacher routes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Registering a student means four things that must stay in step: the auth
 * user, the `profiles` row every screen reads, the `students` row the school
 * works from, and the credentials the caller shows once. The school admin route
 * had all four inline; the class teacher needs exactly the same flow. Copying it
 * would guarantee the two drift, so it lives here and both routes call it.
 *
 * The caller is responsible for AUTHENTICATION and for deciding which class the
 * teacher may touch. This module re-checks that the class belongs to the school,
 * so a crafted `class_id` can never attach a student to another tenant's class.
 */

export type StudentRegistrationInput = {
  school_id: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  class_id?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  parent_phone?: string | null;
  /** Optional custom admission number. Generated when blank. */
  student_id?: string | null;
  nationality?: string | null;
  religion?: string | null;
  blood_group?: string | null;
  parent_occupation?: string | null;
  parent_location?: string | null;
  emergency_contact?: string | null;
  allergies?: string | null;
  health_notes?: string | null;
  recovery_email?: string | null;
  avatar_url?: string | null;
};

export type RegisterStudentResult =
  | { ok: true; student: Record<string, unknown>; password: string; email: string }
  | { ok: false; status: number; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/** The display name every other screen, receipt and report card reads. */
export function buildStudentFullName(input: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    [text(input.first_name), text(input.middle_name), text(input.last_name)]
      .filter(Boolean)
      .join(" ") || "Unnamed Student"
  );
}

/** Best-effort rollback when provisioning fails halfway. */
async function rollbackProvisionedUser(userId: string, schoolId: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  const supabase = getServiceClient();
  await supabase.from("profiles").delete().eq("id", userId).eq("school_id", schoolId);
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => {});
}

export async function registerStudent(
  input: StudentRegistrationInput,
): Promise<RegisterStudentResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY missing" };
  }

  const first = text(input.first_name);
  const middle = text(input.middle_name);
  const last = text(input.last_name);
  if (!first && !last) {
    return {
      ok: false,
      status: 400,
      error: "At least a first name or last name is required",
    };
  }

  const supabase = getServiceClient();

  // Tenant guard: the class must belong to the school the caller is scoped to.
  if (input.class_id) {
    const { data: cls } = await supabase
      .from("classes")
      .select("id")
      .eq("id", input.class_id)
      .eq("school_id", input.school_id)
      .maybeSingle();
    if (!cls) {
      return {
        ok: false,
        status: 400,
        error: "class_id does not belong to this school",
      };
    }
  }

  const { data: schoolData } = await supabase
    .from("schools")
    .select("name, abbreviation")
    .eq("id", input.school_id)
    .single();
  if (!schoolData) return { ok: false, status: 404, error: "School not found" };

  const abbreviation =
    schoolData.abbreviation ||
    (schoolData.name || "school").substring(0, 5).toLowerCase().replace(/\s/g, "");

  const fullName = buildStudentFullName({
    first_name: first,
    middle_name: middle,
    last_name: last,
  });

  // Strip titles and non-alphanumeric chars for the generated username.
  let cleanName = fullName
    .replace(/\b(Mr|Mrs|Ms|Miss|Dr|Prof)\b\.?/gi, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  if (!cleanName) cleanName = "student";

  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", input.school_id);
  const seq = String((count || 0) + 1).padStart(4, "0");
  const admissionNumber = text(input.student_id) || `ADM-${seq}`;

  // Usernames are `<name>@<abbrev>.com`. The check deliberately counts
  // ARCHIVED profiles too: a returning student must never collide with the
  // login of the record that already exists for them.
  const { data: existingProfiles } = await supabase
    .from("profiles")
    .select("email")
    .eq("school_id", input.school_id)
    .like("email", `${cleanName}%@${abbreviation}.com`);

  let finalName = cleanName;
  if (existingProfiles && existingProfiles.length > 0) {
    let suffix = 2;
    while (existingProfiles.some((p) => p.email === `${cleanName}${suffix}@${abbreviation}.com`)) {
      suffix++;
    }
    finalName = `${cleanName}${suffix}`;
  }

  const email = `${finalName}@${abbreviation}.com`;
  const password = `${abbreviation}${abbreviation}${abbreviation}123`.substring(0, 72);

  const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "student", school_id: input.school_id },
    }),
  });
  if (!authRes.ok) {
    const ad = await authRes.json().catch(() => ({}));
    return {
      ok: false,
      status: 500,
      error: ad.msg || ad.message || `Auth error (${authRes.status})`,
    };
  }
  const authData = await authRes.json();
  const userId = authData.user?.id || authData.id;
  if (!userId) {
    return { ok: false, status: 500, error: "Failed to create user account" };
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    school_id: input.school_id,
    full_name: fullName,
    first_name: first || null,
    middle_name: middle || null,
    last_name: last || null,
    email,
    avatar_url: text(input.avatar_url) || null,
    recovery_email: text(input.recovery_email) || null,
    role: "student",
    is_active: true,
  });
  if (profileError) {
    await rollbackProvisionedUser(userId, input.school_id);
    return {
      ok: false,
      status: 500,
      error: `Could not save student profile: ${profileError.message}`,
    };
  }

  const insertData: Record<string, unknown> = {
    school_id: input.school_id,
    profile_id: userId,
    student_id: admissionNumber,
    class_id: input.class_id || null,
    first_name: first || null,
    middle_name: middle || null,
    last_name: last || null,
    date_of_birth: text(input.date_of_birth) || null,
    gender: text(input.gender) || null,
    parent_phone: text(input.parent_phone) || null,
    nationality: text(input.nationality) || null,
    religion: text(input.religion) || null,
    blood_group: text(input.blood_group) || null,
    parent_occupation: text(input.parent_occupation) || null,
    parent_location: text(input.parent_location) || null,
    emergency_contact: text(input.emergency_contact) || null,
    allergies: text(input.allergies) || null,
    health_notes: text(input.health_notes) || null,
    status: "active",
    generated_password: password,
    must_change_password: true,
  };

  const selectShape =
    "*, profiles(full_name, email, avatar_url, phone, is_active), classes(name)";
  const { data: student, error } = await supabase
    .from("students")
    .insert(insertData)
    .select(selectShape)
    .single();

  if (error) {
    // Older deployments may not have the password columns yet; the account is
    // still usable, so retry without them rather than losing the student.
    if (error.message?.includes("generated_password")) {
      delete insertData.generated_password;
      delete insertData.must_change_password;
      const { data: retryStudent, error: retryError } = await supabase
        .from("students")
        .insert(insertData)
        .select(selectShape)
        .single();
      if (retryError) {
        await rollbackProvisionedUser(userId, input.school_id);
        return { ok: false, status: 500, error: retryError.message };
      }
      return {
        ok: true,
        student: retryStudent as Record<string, unknown>,
        password,
        email,
      };
    }
    await rollbackProvisionedUser(userId, input.school_id);
    return { ok: false, status: 500, error: error.message };
  }

  return {
    ok: true,
    student: student as Record<string, unknown>,
    password,
    email,
  };
}
