// ============================================================
// Profile completion — the one definition of "complete enough".
//
// TWO GATES, NOT ONE
// ------------------
//   * the DASHBOARD opens at the role gate (40 for a student);
//   * the RESULTS open at 60 for a student, and only a student.
//
// Results sit higher on purpose. A school can reach a family with a name and a
// phone number, which is all the dashboard needs. A result sheet, though, is the
// child's academic record for the term: it should carry a date of birth, a
// photograph and a way to contact someone in an emergency before it is handed
// out. The screen that refuses says why, and lists exactly what is missing.
//
// THE SCORE IS DERIVED, never a stored flag: `teachers.is_profile_completed`
// and `students.is_profile_completed` exist but nothing has ever written them,
// and an admin editing a record must move the score without a second write.
//
// THE SCHOOL'S OWN NUMBER COUNTS. A student's phone is `profiles.phone` OR the
// guardian number the school took at registration (`students.parent_phone`).
// Reading only the first is what used to bounce every registered student back
// to the profile page on login.
// ============================================================

export type ProfileRole = "super_admin" | "school_admin" | "teacher" | "student";

export type ProfileField =
  | "full_name"
  | "gender"
  | "phone"
  | "contact_email"
  | "date_of_birth"
  | "emergency_contact"
  | "photo"
  | "parent_location"
  | "allergies"
  | "blood_group"
  | "health_notes"
  | "nationality"
  | "parent_occupation"
  | "religion";

/** The dashboard gate. Per role — read `GATE_PERCENT`, not this, for a role. */
export const PROFILE_GATE_PERCENT = 40;

/** What a student needs before a result sheet is theirs to open. */
export const RESULTS_GATE_PERCENT = 60;

/**
 * How each role's profile is scored. Each table sums to 100.
 *
 * Student: the phone is the heaviest field because it is the one thing a school
 * cannot work without. The name is always present. Everything else is worth 5 —
 * real value, but never enough to open a gate on its own.
 *
 * Teacher and school admin keep their previous weighting and their 50 gate: a
 * member of staff must be reachable AND have filled the small form, and lowering
 * it to 40 would let a name plus a gender through with no contact at all.
 */
const WEIGHTS: Record<ProfileRole, Partial<Record<ProfileField, number>>> = {
  student: {
    phone: 25,
    full_name: 15,
    date_of_birth: 5,
    contact_email: 5,
    emergency_contact: 5,
    photo: 5,
    gender: 5,
    parent_location: 5,
    allergies: 5,
    blood_group: 5,
    health_notes: 5,
    nationality: 5,
    parent_occupation: 5,
    religion: 5,
  },
  teacher: { full_name: 30, gender: 10, phone: 30, contact_email: 30 },
  school_admin: { full_name: 40, phone: 30, contact_email: 30 },
  // The platform operator has no tenant profile page; nothing is gated.
  super_admin: {},
};

const GATE_PERCENT: Record<ProfileRole, number> = {
  student: PROFILE_GATE_PERCENT,
  teacher: 50,
  school_admin: 50,
  super_admin: 0,
};

const RESULTS_ROLES: ProfileRole[] = ["student"];

export const FIELD_LABELS: Record<ProfileField, string> = {
  full_name: "Full name",
  gender: "Gender",
  phone: "A phone number we can call",
  contact_email: "Contact email",
  date_of_birth: "Date of birth",
  emergency_contact: "Emergency contact",
  photo: "Photo",
  parent_location: "Home address",
  allergies: "Allergies",
  blood_group: "Blood group",
  health_notes: "Health notes",
  nationality: "Nationality",
  parent_occupation: "Parent's occupation",
  religion: "Religion",
};

/**
 * How to fix each missing field, in the imperative — the block screen prints
 * these verbatim, so a student is told what to do, not merely what is absent.
 */
export const FIELD_ACTIONS: Partial<Record<ProfileField, string>> = {
  phone: "Ask your school for the number they have for your parent or guardian, or add one yourself.",
  contact_email: "Add an email address your family checks.",
  date_of_birth: "Enter the date of birth on your school record.",
  emergency_contact: "Add a second phone number the school can call in an emergency.",
  photo: "Upload a clear photo of your face.",
  parent_location: "Add your home address.",
  gender: "Ask your school office to record this.",
  full_name: "Ask your school office to correct your name.",
};

export interface ProfileSnapshot {
  full_name?: string | null;
  phone?: string | null;
  /** The school's contact address for this person — `profiles.recovery_email`. */
  contact_email?: string | null;
  /** Only teachers and students have one. */
  gender?: string | null;
  date_of_birth?: string | null;
  emergency_contact?: string | null;
  photo?: string | null;
  parent_location?: string | null;
  allergies?: string | null;
  blood_group?: string | null;
  health_notes?: string | null;
  nationality?: string | null;
  parent_occupation?: string | null;
  religion?: string | null;
}

export interface ProfileAssessment {
  percent: number;
  /** The dashboard gate for this role. */
  gate: number;
  /** True when the profile has reached `gate`. */
  complete: boolean;
  /** 60 for a student; null for a role with no result sheet. */
  resultsGate: number | null;
  resultsUnlocked: boolean;
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
  const profileRole = (role as ProfileRole) ?? "super_admin";
  const weights = WEIGHTS[profileRole] ?? {};
  const gate = GATE_PERCENT[profileRole] ?? 0;
  const resultsGate = RESULTS_ROLES.includes(profileRole) ? RESULTS_GATE_PERCENT : null;

  const entries = Object.entries(weights) as [ProfileField, number][];
  if (entries.length === 0) {
    return {
      percent: 100,
      gate,
      complete: true,
      resultsGate,
      resultsUnlocked: true,
      missing: [],
      weights,
    };
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
    gate,
    complete: percent >= gate,
    resultsGate,
    resultsUnlocked: resultsGate === null || percent >= resultsGate,
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
 * writable here. Everything else a student is scored on IS writable, because a
 * gate nobody can clear is not a gate — it is a wall.
 *
 * School admins have no gender: the account represents the institution, and the
 * email they sign in with is changed through its own password-checked flow.
 */
const WRITABLE: Record<ProfileRole, ProfileField[]> = {
  teacher: ["full_name", "gender", "phone", "contact_email"],
  student: [
    "phone",
    "contact_email",
    "date_of_birth",
    "emergency_contact",
    "parent_location",
    "allergies",
    "blood_group",
    "health_notes",
    "nationality",
    "parent_occupation",
    "religion",
  ],
  school_admin: ["full_name", "phone"],
  super_admin: [],
};

/** Every field a profile form can mention, for validation of what was sent. */
export const PROFILE_FIELDS: ProfileField[] = [
  "full_name",
  "gender",
  "phone",
  "contact_email",
  "date_of_birth",
  "emergency_contact",
  "photo",
  "parent_location",
  "allergies",
  "blood_group",
  "health_notes",
  "nationality",
  "parent_occupation",
  "religion",
];

/**
 * The fields a role may submit. Kept here so the API and the forms cannot
 * drift apart.
 */
export function editableProfileFields(role: string): ProfileField[] {
  return WRITABLE[role as ProfileRole] ?? [];
}

/**
 * Where a missing field lives, so the API knows which table to write and the
 * form knows which value it already has.
 */
export const FIELD_TABLE: Record<ProfileField, "profiles" | "students" | "teachers"> = {
  full_name: "profiles",
  phone: "profiles",
  contact_email: "profiles",
  gender: "students",
  date_of_birth: "students",
  emergency_contact: "students",
  photo: "students",
  parent_location: "students",
  allergies: "students",
  blood_group: "students",
  health_notes: "students",
  nationality: "students",
  parent_occupation: "students",
  religion: "students",
};
