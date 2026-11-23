import { getServiceClient } from "./supabase/service";
import { hashPasswordForRegistry } from "./password-hash";
import type { SupabaseClient } from "@supabase/supabase-js";

function generateRandomDigits(length = 8): string {
  // crypto.getRandomValues rather than Math.random: these are credentials.
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let r = "";
  for (let i = 0; i < length; i++) r += String(buf[i] % 10);
  return r;
}

const ROLE_LETTERS: Record<string, string> = {
  school_admin: "A",
  teacher: "T",
  student: "S",
};

/**
 * The school's shared starter password for student accounts.
 *
 * STUDENT ACCOUNTS ARE DELIBERATELY DIFFERENT FROM STAFF ACCOUNTS. A class
 * teacher reads one password to the room, and every child is forced to choose
 * their own on first sign-in; after that the system no longer knows the value
 * (login clears `generated_password`). So there is no secret to invent here —
 * inventing a different random string per child only means thirty passwords to
 * distribute instead of one.
 *
 * Derived from the SCHOOL, not from a platform constant: the password is unique
 * per school, so a value read off one school's sheet cannot open another
 * school's accounts. The shape is `<abbrev><abbrev><abbrev>123` ("cvs" →
 * "cvscvscvs123"), which is what creation has always used, so students created
 * earlier and students reset later end up with the same password.
 *
 * TRADE-OFF, stated plainly: this value is guessable by anyone who knows the
 * school's abbreviation. It is safe only because it opens nothing until the
 * account is used, and every account that uses it is forced to change it
 * immediately. Do not reuse this helper for teacher or admin accounts.
 */
export function defaultStudentPassword(
  school: { name?: string | null; abbreviation?: string | null } | null | undefined,
): string {
  const abbreviation =
    school?.abbreviation ||
    (school?.name || "school").substring(0, 5).toLowerCase().replace(/\s/g, "");
  return `${abbreviation}${abbreviation}${abbreviation}123`.substring(0, 72);
}

/**
 * Generates a readable, shareable password for a new account.
 *
 * Plaintext is deliberately NOT persisted. Uniqueness is checked against a
 * one-way digest in `password_history`, so the registry can still prevent
 * reissuing the same value without the database holding the credential itself.
 *
 * Length is 8 random digits (100 million combinations) rather than 5, so an
 * online guess is not practical even before rate limiting is considered.
 */
export async function generateUniquePassword(
  schoolOrClient: string | SupabaseClient,
  role: string,
  maybeSchool?: string,
): Promise<string> {
  let schoolName: string;
  let supabase: SupabaseClient;

  if (typeof schoolOrClient === "string") {
    schoolName = schoolOrClient;
    supabase = getServiceClient();
  } else {
    supabase = schoolOrClient;
    schoolName = maybeSchool || schoolOrClient?.toString() || "SCH";
  }

  const prefix =
    schoolName
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "SCH";
  const roleLetter = ROLE_LETTERS[role] || "X";

  let password = "";
  let digest = "";
  let unique = false;
  let attempts = 0;

  while (!unique && attempts < 30) {
    password = `${prefix}${generateRandomDigits(8)}`;
    digest = await hashPasswordForRegistry(password);

    const { data } = await supabase
      .from("password_history")
      .select("id")
      .eq("password", digest)
      .maybeSingle();

    if (!data) unique = true;
    attempts++;
  }

  // Store the digest, never the password.
  await supabase
    .from("password_history")
    .insert({ password: digest, school_prefix: `${prefix}${roleLetter}`, role });

  return password;
}
