/**
 * Single source of the session-signing secret.
 *
 * The session JWT must NEVER be signed with the Supabase service-role key.
 * That key bypasses Row Level Security and can read/write every tenant's data,
 * so using it as a signing secret means a single leaked value both forges any
 * user's session AND opens the whole database. It also silently invalidates
 * every session whenever the key is rotated.
 *
 * This module also replaces the previous hardcoded
 * "fallback-insecure-secret" literal, which anyone could use to forge a
 * super-admin session when JWT_SECRET was unset.
 *
 * Behaviour:
 *   - No secret configured  -> throws (fail closed, never a guessable default)
 *   - Secret equals the service-role key -> throws
 *   - Secret shorter than 32 chars -> warns, still works
 *
 * Edge-compatible on purpose: no Node APIs, so `middleware.ts` can import it.
 * The returned value is cached per process.
 */

const MIN_RECOMMENDED_LENGTH = 32;

export const JWT_SECRET_ERROR =
  "JWT_SECRET is not configured. Session signing requires a dedicated secret. " +
  "SUPABASE_SERVICE_ROLE_KEY must never be used as a signing key.";

let cached: Uint8Array | null = null;

export function getJwtSecret(): Uint8Array {
  if (cached) return cached;

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(JWT_SECRET_ERROR);
  }

  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    secret === process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "JWT_SECRET must not be the Supabase service-role key. Use a dedicated, " +
        "randomly generated value that grants no database access."
    );
  }

  if (secret.length < MIN_RECOMMENDED_LENGTH) {
    console.error(
      `[jwt-secret] WARNING: JWT_SECRET is only ${secret.length} characters. ` +
        `Use at least ${MIN_RECOMMENDED_LENGTH} random characters.`
    );
  }

  cached = new TextEncoder().encode(secret);
  return cached;
}

/** True when a usable signing secret is configured. Never throws. */
export function isJwtSecretConfigured(): boolean {
  try {
    getJwtSecret();
    return true;
  } catch {
    return false;
  }
}
