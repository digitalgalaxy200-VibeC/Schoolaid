import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

/**
 * Tenant-scoped Supabase client for the CBT domain.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every existing route talks to Postgres through the service-role client, which
 * bypasses Row Level Security. That is acceptable for the legacy surface, but it
 * means tenant isolation depends entirely on each route remembering to add
 * `.eq("school_id", ...)`.
 *
 * The CBT domain is the first surface held to a stronger standard: the database
 * enforces tenancy as well. For RLS to apply, the request must carry a JWT that
 * PostgREST accepts with `school_id` in its claims. SchoolEd already issues its
 * own session JWT, so it can mint such a token itself — no migration to Supabase
 * Auth and no custom access-token hook is needed.
 *
 * DESIGN CONSTRAINTS
 * ------------------
 * - `school_id` is NEVER taken from a request. The caller passes it in after
 *   deriving it from an already-verified session.
 * - The token is short-lived and scoped to exactly one school.
 * - The signing secret is the Supabase project JWT secret, which grants no
 *   database access — deliberately different from the service-role key.
 * - Fails closed: with no configured secret this throws rather than silently
 *   falling back to the service-role client, which would quietly disable RLS.
 *
 * PREREQUISITE: the project must use the legacy HS256 shared JWT secret. The
 * staging keys decode as `alg: HS256` (checked 2026-09-18). If a project moves
 * to asymmetric JWT signing keys, sign with the private key instead.
 */

const TOKEN_TTL_SECONDS = 120;

export class TenantClientConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantClientConfigurationError";
  }
}

function getSigningSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new TenantClientConfigurationError(
      "SUPABASE_JWT_SECRET is not configured, so a tenant-scoped client cannot be " +
        "created. Refusing to fall back to the service-role client because that " +
        "would silently disable Row Level Security. Find the value in the Supabase " +
        "dashboard under Project Settings -> API -> JWT Secret.",
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Mints a short-lived PostgREST-compatible token for one tenant.
 * `schoolId` must already have been derived from a verified session.
 */
export async function mintTenantToken(args: {
  userId: string;
  schoolId: string;
}): Promise<string> {
  if (!args.userId || !args.schoolId) {
    throw new TenantClientConfigurationError(
      "mintTenantToken requires both userId and schoolId.",
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ school_id: args.schoolId, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.userId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(getSigningSecret());
}

/**
 * Builds a Supabase client whose requests are subject to RLS for one tenant.
 * Use this for CBT reads and writes instead of `getServiceClient()`.
 */
export async function createTenantScopedClient(args: {
  userId: string;
  schoolId: string;
}): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new TenantClientConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.",
    );
  }

  const token = await mintTenantToken(args);

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** True when the tenant-scoped client can be constructed. Never throws. */
export function isTenantClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET);
}
