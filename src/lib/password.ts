import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gets a 3-letter uppercase prefix from a school slug or name.
 */
function getSchoolPrefix(slugOrName: string): string {
  // Strip non-alphabetic chars
  const alphaOnly = slugOrName.replace(/[^a-zA-Z]/g, "");
  // Take first 3 letters and uppercase
  const prefix = alphaOnly.substring(0, 3).toUpperCase();
  // Pad with 'X' if less than 3 chars (rare)
  return prefix.padEnd(3, "X");
}

/**
 * Generates a standard password string according to platform rules.
 */
function generatePasswordString(schoolSlug: string, role: string): string {
  const prefix = getSchoolPrefix(schoolSlug);

  let roleIdentifier = "A"; // default admin
  if (role === "student") roleIdentifier = "S";
  if (role === "teacher") roleIdentifier = "T";

  // Generate 5 random digits
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString(); // 10000-99999

  return `${prefix}${roleIdentifier}${randomDigits}`;
}

/**
 * Generates a globally unique password, verifying against the password_history table.
 */
export async function generateUniquePassword(
  supabase: SupabaseClient,
  schoolSlug: string,
  role: string,
): Promise<string> {
  const maxRetries = 10;

  for (let i = 0; i < maxRetries; i++) {
    const newPassword = generatePasswordString(schoolSlug, role);

    // Attempt to insert into password_history to claim this password
    const { error } = await supabase
      .from("password_history")
      .insert({ password_string: newPassword });

    // If successful (no unique constraint violation), return it
    if (!error) {
      return newPassword;
    }

    // Postgres unique constraint violation code is 23505
    if (error.code !== "23505") {
      // If it's some other DB error, throw it so we don't loop endlessly
      throw new Error(`Failed to verify password uniqueness: ${error.message}`);
    }
  }

  throw new Error(
    "Failed to generate a unique password after maximum retries",
  );
}
