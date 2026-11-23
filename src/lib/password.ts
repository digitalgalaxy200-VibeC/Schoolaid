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
 * The single starter password for EVERY student account, in every school.
 *
 * WHY ONE VALUE, NOT ONE PER SCHOOL
 * ---------------------------------
 * The school asked for a password they can say once and be understood: "S12345".
 * A per-school derivation (`cvscvscvs123`) was more private but harder to hand
 * out — the class teacher had to read out a school-specific string, and it went
 * stale whenever the abbreviation changed. One constant is the trade the school
 * chose, so it lives here, in one place, and nowhere else.
 *
 * THE TRADE, STATED PLAINLY: because it is the same everywhere, anyone who knows
 * `S12345` can sign in to any student account that has never been used. The
 * protections that make it acceptable are structural, not secrecy:
 *
 *   - every account carrying it is flagged `must_change_password`, and cannot
 *     reach a dashboard until the child chooses their own;
 *   - the stored copy is erased on first sign-in, so a used account no longer
 *     accepts this password at all;
 *   - resetting restores it deliberately, which is the point — a forgotten
 *     password always comes back to the word the school already knows.
 *
 * Do NOT reuse this for teacher or school-admin accounts: those are not handed
 * out in a room, and a shared value there would be a real credential leak.
 */
export const DEFAULT_STUDENT_PASSWORD = "S12345";

/**
 * The starter password for student accounts: `S12345`.
 *
 * A function rather than a bare constant at the call sites so the rule has one
 * name in the codebase ("the default student password") and can change in one
 * place if the school changes its mind about the value.
 */
export function defaultStudentPassword(): string {
  return DEFAULT_STUDENT_PASSWORD;
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
