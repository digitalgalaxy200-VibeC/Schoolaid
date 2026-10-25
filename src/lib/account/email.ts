/**
 * The two decisions a school admin's email change needs to get right before it
 * touches Auth or the database.
 *
 * Kept pure and separate from the route so they can be tested without a session,
 * a Supabase client or a network: a wrong answer here either rejects a valid
 * address or lets a wildcard through a uniqueness check.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; error: string };

/**
 * Trim, lowercase, and decide whether this is an address we will store.
 *
 * Lowercasing is not cosmetic: sign-in lowercases before looking the account up,
 * so storing a different case would create an account that looks right in the
 * UI and cannot be found when someone types it.
 */
export function normaliseAccountEmail(raw: unknown): EmailCheck {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!email) return { ok: false, error: "Enter the new email address." };
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "That email address is too long." };
  }
  if (!EMAIL.test(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }

  return { ok: true, email };
}

/**
 * Escapes LIKE wildcards so an address containing `%` or `_` is matched
 * literally. Without this, `%@%.com` would match the first profile in the
 * database and the uniqueness check would refuse a perfectly good address.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}
