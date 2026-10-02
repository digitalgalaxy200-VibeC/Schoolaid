import { ValidationErrors } from "@/lib/validate";

/**
 * The student fields a teacher may correct, and nothing else.
 *
 * PART C OF THE AGREED SCOPE. A teacher exists here to CORRECT a child's record,
 * not to administer it: registration, class transfer, admission numbers, account
 * state and every other administrative field are deliberately absent from this
 * allow-list, so a crafted request cannot reach them even if the UI never offers
 * them. The route reads ONLY these keys out of the body.
 *
 * `parent_phone` is presented to the teacher as "Parent/Guardian WhatsApp
 * Number" — the number the school actually uses to reach a parent. It is the
 * SAME stored column finance already builds wa.me links from, on purpose: a
 * second number column would silently split the contact the school relies on.
 */

export const TEACHER_EDITABLE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "date_of_birth",
  "gender",
  "parent_phone",
] as const;

export type TeacherStudentEdit = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  gender: "male" | "female" | null;
  parent_phone: string | null;
};

const NAME_MAX = 100;
const PHONE_MAX = 40;

/** The displayed name, composed the way the rest of the app reads it. */
export function composeFullName(parts: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}): string {
  return [parts.first_name, parts.middle_name, parts.last_name].filter(Boolean).join(" ");
}

/**
 * Splits a stored name for the edit form.
 *
 * Stored parts WIN; a legacy row with only `full_name` falls back to
 * first-word / middle / last-word so the form opens with something sensible
 * instead of three empty boxes over a name the school can see on every screen.
 */
export function splitStoredName(row: {
  first: string | null;
  middle: string | null;
  last: string | null;
  fullName: string | null;
}): { first: string; middle: string; last: string } {
  if (row.first || row.middle || row.last) {
    return { first: row.first ?? "", middle: row.middle ?? "", last: row.last ?? "" };
  }

  const parts = (row.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

/** A trimmed string; empty becomes null. Absent and wrong-typed are errors. */
function clean(
  value: unknown,
  field: string,
  max: number,
  errors: ValidationErrors,
): string | null | undefined {
  if (value === undefined) {
    errors.add(field, "is required (send an empty value to clear it)");
    return undefined;
  }
  if (typeof value !== "string") {
    errors.add(field, "must be a string");
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.add(field, `must be at most ${max} characters`);
    return undefined;
  }
  return trimmed === "" ? null : trimmed;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Parses the edit form's body.
 *
 * The form always sends every field (an empty string means "cleared"), so a
 * missing field is a caller mistake rather than a partial update — partial
 * updates would let a stale form silently overwrite a field it never showed.
 */
export function parseTeacherStudentEdit(
  body: unknown,
  errors: ValidationErrors,
): TeacherStudentEdit | null {
  const source =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const first = clean(source.first_name, "first_name", NAME_MAX, errors);
  const middle = clean(source.middle_name, "middle_name", NAME_MAX, errors);
  const last = clean(source.last_name, "last_name", NAME_MAX, errors);

  // A name may be a single word, but it may not be nothing: `full_name` is what
  // every other screen, receipt and report card reads.
  if (first !== undefined && last !== undefined && first === null && last === null) {
    errors.add("first_name", "a student needs a first or last name");
  }

  let date_of_birth: string | null = null;
  const rawDate = clean(source.date_of_birth, "date_of_birth", 10, errors);
  if (typeof rawDate === "string") {
    if (!isRealDate(rawDate)) {
      errors.add("date_of_birth", "must be a real date (YYYY-MM-DD)");
    } else if (rawDate > new Date().toISOString().slice(0, 10)) {
      errors.add("date_of_birth", "cannot be in the future");
    } else {
      date_of_birth = rawDate;
    }
  }

  let gender: "male" | "female" | null = null;
  const rawGender = clean(source.gender, "gender", 20, errors);
  if (typeof rawGender === "string") {
    const normalised = rawGender.toLowerCase();
    if (normalised !== "male" && normalised !== "female") {
      errors.add("gender", "must be male or female");
    } else {
      gender = normalised;
    }
  }

  const rawPhone = clean(source.parent_phone, "parent_phone", PHONE_MAX, errors);
  const parent_phone: string | null = typeof rawPhone === "string" ? rawPhone : null;

  if (!errors.ok) return null;
  if (first === undefined || last === undefined || middle === undefined) return null;

  return {
    first_name: first ?? "",
    middle_name: middle,
    last_name: last ?? "",
    date_of_birth,
    gender,
    parent_phone,
  };
}
