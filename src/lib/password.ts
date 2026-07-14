import { getServiceClient } from "./supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

// Unambiguous alphanumeric charset (no 0/O, 1/I/L) so a generated password
// stays easy to read off a screen or handwritten note.
const SUFFIX_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SUFFIX_LENGTH = 8;

// Previously generated a 5-digit numeric suffix via Math.random() — only
// 100,000 combinations per (school prefix, role), and Math.random() is not
// cryptographically secure. This generates SUFFIX_LENGTH characters from a
// larger charset using crypto.randomInt, giving roughly 32^8 (~10^12)
// combinations. See docs/CORRECTIONS_SECURITE.md.
function generateRandomSuffix(length = SUFFIX_LENGTH): string {
  let r = "";
  for (let i = 0; i < length; i++) {
    r += SUFFIX_CHARSET[randomInt(0, SUFFIX_CHARSET.length)];
  }
  return r;
}

const ROLE_LETTERS: Record<string, string> = {
  school_admin: "A",
  teacher: "T",
  student: "S",
};

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
  let unique = false;
  let attempts = 0;

  while (!unique && attempts < 30) {
    password = `${prefix}${roleLetter}${generateRandomSuffix()}`;
    const { data } = await supabase
      .from("password_history")
      .select("id")
      .eq("password", password)
      .maybeSingle();
    if (!data) unique = true;
    attempts++;
  }

  await supabase
    .from("password_history")
    .insert({ password, school_prefix: prefix, role });
  return password;
}
