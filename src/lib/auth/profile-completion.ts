// ============================================================
// Profile completion — the one definition of "complete enough".
//
// A new account signs in with a generated password, changes it, and then lands
// on its profile. It may move on once the profile is at least 50% complete;
// anything less keeps the rest of the dashboard closed.
//
// The bar is deliberately low. What is wanted is a way to reach the person — a
// phone number or a contact email — not a finished personnel file. Gender is
// recorded but cannot unlock the gate on its own.
//
// The score is DERIVED from the stored values, never from a flag:
//   * `teachers.is_profile_completed` / `students.is_profile_completed` exist
//     but nothing has ever written them, so trusting them would both need a
//     backfill and risk locking out existing accounts whose data is fine;
//   * a school admin can correct a teacher's or student's record at any time,
//     and the score must follow that change without a second bookkeeping write.
//
// SCHOOL ADMINS HAVE NO GENDER. The school admin account represents the
// institution, not a person, so gender is deliberately absent from its weight
// table and from its profile form.
// ============================================================

export type ProfileRole = "super_admin" | "school_admin" | "teacher" | "student";

export type ProfileField = "full_name" | "gender" | "phone" | "contact_email";

/** The score at which the rest of the dashboard opens. */
export const PROFILE_GATE_PERCENT = 50;

/**
 * How each role's profile is scored. Each table sums to 100.
 *
 * Teacher/student: the full name is always present (the column is NOT NULL), so
 * 50 points means a PHONE NUMBER or a CONTACT EMAIL. Gender is worth 10 — it is
 * collected, but a name plus gender (40) must not open the dashboard.
 *
 * School admin: the institution's name plus one contact channel reaches 70, so
 * the 50-point gate cannot be met by the name alone.
 */
const WEIGHTS: Record<ProfileRole, Partial<Record<ProfileField, number>>> = {
  teacher: { full_name: 30, gender: 10, phone: 30, contact_email: 30 },
  student: { full_name: 30, gender: 10, phone: 30, contact_email: 30 },
  school_admin: { full_name: 40, phone: 30, contact_email: 30 },
  // The platform operator has no tenant profile page; nothing is gated.
  super_admin: {},
};

export const FIELD_LABELS: Record<ProfileField, string> = {
  full_name: "Full name",
  gender: "Gender",
  phone: "Phone number",
  contact_email: "Contact email",
};

export interface ProfileSnapshot {
  full_name?: string | null;
  phone?: string | null;
  /** The school's contact address for this person — `profiles.recovery_email`. */
  contact_email?: string | null;
  /** Only teachers and students have one. */
  gender?: string | null;
}

export interface ProfileAssessment {
  percent: number;
  /** True when the profile has reached `PROFILE_GATE_PERCENT`. */
  complete: boolean;
  missing: ProfileField[];
  /** Sums to 100 and is what the form is scored against. */
  weights: Partial<Record<ProfileField, number>>;
}

/** A field counts when it holds something a person can act on. */
function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Scores a profile. Pure: the caller fetches the columns, this decides.
 *
 * Presence, not validity, is what counts. A user must never be shut out of
 * their dashboard because a phone number is saved in an unusual format — the
 * write path validates what it accepts, and a value already stored is treated
 * as the user's own.
 */
export function assessProfile(role: string, snapshot: ProfileSnapshot): ProfileAssessment {
  const weights = WEIGHTS[role as ProfileRole] ?? {};
  const entries = Object.entries(weights) as [ProfileField, number][];

  if (entries.length === 0) {
    return { percent: 100, complete: true, missing: [], weights };
  }

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let earned = 0;
  const missing: ProfileField[] = [];

  for (const [field, weight] of entries) {
    if (isFilled(snapshot[field])) earned += weight;
    else missing.push(field);
  }

  const percent = Math.round((earned / total) * 100);
  return {
    percent,
    complete: percent >= PROFILE_GATE_PERCENT,
    missing,
    weights,
  };
}

/** Where a role completes its profile, or null when there is nothing to gate. */
export function profilePath(role: string): string | null {
  switch (role) {
    case "teacher":
      return "/teacher/profile";
    case "student":
      return "/student/profile";
    case "school_admin":
      return "/school-admin/profile";
    default:
      return null;
  }
}

/**
 * The fields each role may WRITE from a profile form.
 *
 * A student's name and gender belong to the school register, so they are not
 * writable here at all — the form does not send them, and the API refuses them
 * if they arrive anyway. Teachers and school admins manage their own details.
 * School admins have no gender: the account represents the institution.
 */
const WRITABLE: Record<ProfileRole, ProfileField[]> = {
  teacher: ["full_name", "gender", "phone", "contact_email"],
  student: ["phone", "contact_email"],
  // The email a school admin signs in with is changed through its own
  // password-checked flow, so it is not a field on this form.
  school_admin: ["full_name", "phone"],
  super_admin: [],
};

/** Every field a profile form can mention, for validation of what was sent. */
export const PROFILE_FIELDS: ProfileField[] = [
  "full_name",
  "gender",
  "phone",
  "contact_email",
];

/**
 * The fields a role may submit. Kept here so the API and the forms cannot
 * drift apart.
 */
export function editableProfileFields(role: string): ProfileField[] {
  return WRITABLE[role as ProfileRole] ?? [];
}
