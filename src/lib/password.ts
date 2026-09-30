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
