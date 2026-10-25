import { getServiceClient } from "@/lib/supabase/service";

/**
 * Duplicate-student detection.
 *
 * A teacher registering "John Doe" may be re-registering a child who was
 * archived last term. Creating a second identity splits that child's results,
 * payments and report cards, so the add flow warns BEFORE writing anything.
 *
 * The warning is deliberately a warning, not a block. Two children can share a
 * name; the teacher can confirm both are real by registering anyway. What makes
 * a match STRONG is a second identifier — the same class, date of birth,
 * admission number or parent phone — never the name on its own.
 */

type Db = ReturnType<typeof getServiceClient>;

export type StudentNameParts = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

export type DuplicateSignal =
  | "same_name"
  | "same_class"
  | "same_dob"
  | "same_phone"
  | "same_admission_number";

export type DuplicateConfidence = "high" | "medium" | "low";

export type DuplicateSearchInput = StudentNameParts & {
  school_id: string;
  class_id?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  parent_phone?: string | null;
  student_id?: string | null;
};

export type DuplicateMatch = {
  id: string;
  student_id: string | null;
  class_id: string | null;
  class_name: string | null;
  full_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  parent_phone: string | null;
  archived: boolean;
  /** True when this teacher's class may adopt the archived record. */
  can_restore: boolean;
  signals: DuplicateSignal[];
  confidence: DuplicateConfidence;
};

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof"]);

/** Lower-case name tokens, in the order they were written, minus titles. */
export function nameTokens(parts: StudentNameParts): string[] {
  const structured = [parts.first_name, parts.middle_name, parts.last_name]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ");
  const raw = structured || parts.full_name || "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "" && !TITLES.has(token));
}

/**
 * Whether two names plausibly belong to the same person.
 *
 * First and last tokens must agree (in either order, because legacy rows store
 * some names family-name-first), and a middle name is ignored: "John Doe" and
 * "John Michael Doe" are the same child on different forms.
 */
export function sameStudentName(a: StudentNameParts, b: StudentNameParts): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const firstA = ta[0];
  const lastA = ta[ta.length - 1];
  const firstB = tb[0];
  const lastB = tb[tb.length - 1];

  if (ta.length === 1 && tb.length === 1) return firstA === firstB;
  if (ta.length === 1) return firstA === firstB || firstA === lastB;
  if (tb.length === 1) return lastA === firstB || firstA === firstB;
  return (firstA === firstB && lastA === lastB) || (firstA === lastB && lastA === firstB);
}

/**
 * The last 10 digits of a phone number.
 *
 * Nigerian numbers reach the same line as `0803...` or `+234803...`; comparing
 * the tail means the teacher does not have to match the parent's formatting.
 */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function dateOnly(value: string | null | undefined): string {
  return (value || "").trim().slice(0, 10);
}

type Candidate = StudentNameParts & {
  id: string;
  student_id?: string | null;
  class_id?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  parent_phone?: string | null;
  is_active?: boolean | null;
};

/**
 * Scores one candidate against the registration being attempted.
 *
 * Returns null when the records cannot refer to the same person: a different
 * name is only a match when the admission number is identical (that is a real
 * identifier, not a guess).
 */
export function describeMatch(
  input: DuplicateSearchInput,
  candidate: Candidate,
): { signals: DuplicateSignal[]; confidence: DuplicateConfidence } | null {
  const signals: DuplicateSignal[] = [];

  const sameName = sameStudentName(input, candidate);
  if (sameName) signals.push("same_name");

  if (input.class_id && candidate.class_id && input.class_id === candidate.class_id) {
    signals.push("same_class");
  }

  const dobA = dateOnly(input.date_of_birth);
  const dobB = dateOnly(candidate.date_of_birth);
  if (dobA && dobB && dobA === dobB) signals.push("same_dob");

  const phoneA = normalizePhone(input.parent_phone);
  const phoneB = normalizePhone(candidate.parent_phone);
  if (phoneA && phoneB && phoneA === phoneB) signals.push("same_phone");

  const admissionA = (input.student_id || "").trim().toLowerCase();
  const admissionB = (candidate.student_id || "").trim().toLowerCase();
  const sameAdmission = !!admissionA && admissionA === admissionB;
  if (sameAdmission) signals.push("same_admission_number");

  if (!sameName && !sameAdmission) return null;

  let confidence: DuplicateConfidence = "low";
  if (sameAdmission || (sameName && (signals.includes("same_class") || signals.includes("same_dob")))) {
    confidence = "high";
  } else if (
    sameName &&
    (signals.includes("same_phone") || signals.includes("same_admission_number"))
  ) {
    confidence = "medium";
  }

  return { signals, confidence };
}

const CONFIDENCE_ORDER: Record<DuplicateConfidence, number> = { high: 0, medium: 1, low: 2 };

const CANDIDATE_SELECT =
  "id, student_id, class_id, first_name, middle_name, last_name, date_of_birth, gender, parent_phone, profiles!inner(full_name, email, is_active), classes(name)";

type ProfileJoin = { full_name: string | null; email: string | null; is_active: boolean | null };
type ClassJoin = { name: string | null };

function joined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Finds students in the same school who may already be the child being
 * registered, INCLUDING archived ones.
 *
 * Candidates are narrowed in SQL by the first/last name tokens (case and
 * punctuation insensitive) and scored in JS, so a partially-matching name is
 * never treated as a duplicate on its own.
 */
export async function findPossibleDuplicates(
  db: Db,
  input: DuplicateSearchInput,
): Promise<DuplicateMatch[]> {
  const tokens = Array.from(new Set(nameTokens(input))).filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];

  const searchTokens = Array.from(new Set([tokens[0], tokens[tokens.length - 1]]));

  const results = await Promise.all(
    searchTokens.map((token) =>
      db
        .from("students")
        .select(CANDIDATE_SELECT)
        .eq("school_id", input.school_id)
        .ilike("profiles.full_name", `%${token}%`)
        .limit(50),
    ),
  );

  const byId = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    for (const row of (result.data || []) as Record<string, unknown>[]) {
      byId.set(row.id as string, row);
    }
  }

  const matches: DuplicateMatch[] = [];
  for (const row of byId.values()) {
    const profile = joined(row.profiles as ProfileJoin | ProfileJoin[] | null);
    const cls = joined(row.classes as ClassJoin | ClassJoin[] | null);

    const candidate: Candidate = {
      id: row.id as string,
      student_id: (row.student_id as string | null) ?? null,
      class_id: (row.class_id as string | null) ?? null,
      first_name: (row.first_name as string | null) ?? null,
      middle_name: (row.middle_name as string | null) ?? null,
      last_name: (row.last_name as string | null) ?? null,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      date_of_birth: (row.date_of_birth as string | null) ?? null,
      gender: (row.gender as string | null) ?? null,
      parent_phone: (row.parent_phone as string | null) ?? null,
      is_active: profile?.is_active ?? null,
    };

    const described = describeMatch(input, candidate);
    if (!described) continue;

    const archived = candidate.is_active === false;
    matches.push({
      id: candidate.id,
      student_id: candidate.student_id ?? null,
      class_id: candidate.class_id ?? null,
      class_name: cls?.name ?? null,
      full_name:
        candidate.full_name ||
        [candidate.first_name, candidate.middle_name, candidate.last_name]
          .filter(Boolean)
          .join(" ") ||
        "Unnamed student",
      first_name: candidate.first_name ?? null,
      middle_name: candidate.middle_name ?? null,
      last_name: candidate.last_name ?? null,
      email: candidate.email ?? null,
      date_of_birth: candidate.date_of_birth ?? null,
      gender: candidate.gender ?? null,
      parent_phone: candidate.parent_phone ?? null,
      archived,
      // An archived record can be restored into the teacher's class when it
      // belonged to that class, or when it has no class to restore it to.
      can_restore: archived && (!candidate.class_id || candidate.class_id === input.class_id),
      signals: described.signals,
      confidence: described.confidence,
    });
  }

  return matches.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? -1 : 1;
    return CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
  });
}
