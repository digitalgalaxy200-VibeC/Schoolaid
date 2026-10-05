/**
 * Supabase's auth admin API fails in two ways that look alike up close:
 *
 *  - The user genuinely does not exist        -> 404 "User not found"
 *  - The user exists but cannot be loaded     -> 500 "Database error loading user"
 *    (invalid auth row: NULL created_at/tokens, missing auth.identities, etc.)
 *
 * The second case was once treated as the first: callers tried to re-create the
 * account with the same UUID — which can never succeed — and the real error was
 * hidden behind a generic message. Keep this classification pure and tested so
 * a read failure is never mistaken for a missing user again.
 */
export type AuthUserErrorKind = "missing" | "unloadable" | "other";

export function classifyAuthUserError(status: number, body: string): AuthUserErrorKind {
  if (/error loading user/i.test(body)) return "unloadable";
  if (status === 404 || /user not found/i.test(body)) return "missing";
  return "other";
}

export type SetAuthUserPasswordResult =
  | { ok: true }
  | { ok: false; reason: "unloadable" | "create_failed" | "other" };

/**
 * Sets a user's password through the Supabase auth admin API, with the
 * create-if-genuinely-missing fallback that account provisioning relies on.
 *
 * ONE copy of this logic, used by every reset route (school admin, teacher), so
 * the "Database error loading user" misdiagnosis that once turned a read
 * failure into a doomed re-create cannot reappear in a second place.
 */
export async function setAuthUserPassword(opts: {
  userId: string;
  email: string | null;
  password: string;
}): Promise<SetAuthUserPasswordResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { "Content-Type": "application/json", apikey: key!, Authorization: `Bearer ${key!}` };

  try {
    const updateRes = await fetch(`${url}/auth/v1/admin/users/${opts.userId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password: opts.password, user_metadata: { must_change_password: true } }),
    });
    if (updateRes.ok) return { ok: true };

    const errorBody = await updateRes.text();
    console.error("Auth update error (Supabase):", errorBody);
    const kind = classifyAuthUserError(updateRes.status, errorBody);

    // Only a genuine "not found" may fall through to creating the account.
    // "Database error loading user" means the account EXISTS but GoTrue could
    // not load it; re-creating with the same UUID can never succeed.
    if (kind === "missing" && opts.email) {
      const createRes = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: opts.userId, // keep the same UUID so DB FK references stay intact
          email: opts.email,
          password: opts.password,
          email_confirm: true,
          user_metadata: { must_change_password: true },
        }),
      });
      if (createRes.ok) return { ok: true };
      console.error("Auth create error (Supabase):", await createRes.text());
      return { ok: false, reason: "create_failed" };
    }

    if (kind === "unloadable") return { ok: false, reason: "unloadable" };
    return { ok: false, reason: "other" };
  } catch (err) {
    console.error("[auth-users] password set failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "other" };
  }
}

/** The user-facing message for each failure, in one place so every reset route speaks alike. */
export function authResetErrorMessage(reason: "unloadable" | "create_failed" | "other"): string {
  switch (reason) {
    case "unloadable":
      return "This account exists but cannot be loaded by the authentication service. Please contact support.";
    case "create_failed":
      return "The user account could not be set up. Please try again or contact support.";
    case "other":
      return "Failed to reset the password. Please try again later.";
  }
}
