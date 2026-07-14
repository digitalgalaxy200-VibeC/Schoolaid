/**
 * Returns the HMAC secret used to sign/verify the app's session JWTs
 * (the "schoolaid-session" cookie).
 *
 * IMPORTANT: JWT_SECRET must be set explicitly in every environment
 * (local, staging, production) to a long random value, e.g. generated
 * with `openssl rand -base64 32`.
 *
 * Earlier versions of this codebase had six separate copies of this
 * function, each falling back to `SUPABASE_SERVICE_ROLE_KEY` (a much
 * more sensitive secret, meant for a different purpose) and then to a
 * hardcoded literal ("fallback-insecure-secret" or "") when JWT_SECRET
 * was missing. That meant a misconfigured deployment would silently
 * sign every session with a weak, shared, or guessable secret instead
 * of failing loudly. This throws instead, and every call site is
 * already wrapped in a try/catch (or the framework's own request-level
 * error handling), so the practical effect of a missing JWT_SECRET is
 * "no session can be created or verified" rather than "sessions are
 * insecure but appear to work".
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is not set or is too short. Set a long random value (e.g. `openssl rand -base64 32`) " +
        "as the JWT_SECRET environment variable. Do not reuse SUPABASE_SERVICE_ROLE_KEY or any other " +
        "existing secret for this."
    );
  }
  return new TextEncoder().encode(secret);
}
