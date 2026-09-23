import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";
import {
  createTenantScopedClient,
  isTenantClientConfigured,
  mintTenantToken,
} from "../scoped-client";

/**
 * LIVE transport tests for the tenant-scoped client (Phase 7's real deliverable).
 *
 * WHY THESE ARE OPT-IN
 * --------------------
 * They make network calls to PostgREST and read the staging database. The normal
 * `npm test` must stay offline and deterministic, so these run only when asked:
 *
 *     CBT_LIVE=1 npx vitest run src/lib/cbt/__tests__/live-scoped-client.test.ts
 *
 * WHY THEY EXIST AT ALL
 * ---------------------
 * The SQL harness sets `request.jwt.claims` directly. That proves the POLICIES
 * are right; it does not prove that a token this codebase mints is accepted, nor
 * that the signature is checked. Those are different failures and only this file
 * catches them:
 *
 *   - If `mintTenantToken` ever emitted the wrong `aud`, the wrong `alg`, or a
 *     malformed claim, every CBT route would 401 while the SQL suite stayed green.
 *   - If the secret were swapped for another project's, the SQL suite would still
 *     pass and every request would 401.
 *
 * The negative cases matter as much as the positive one. A test that only asserts
 * "a request succeeded" cannot tell a verified signature from an ignored one.
 */

const REPO = path.join(__dirname, "..", "..", "..", "..");

function readEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of [".env.local", ".env.staging"]) {
    const p = path.join(REPO, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const env = readEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const JWT_SECRET = env.SUPABASE_JWT_SECRET ?? "";
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

// The modules under test read `process.env` themselves, so the values have to be
// published there and not merely held in this file. Without this the suite
// "passes" against a local copy while the real client throws 'not configured' —
// which is exactly the false confidence the live tests exist to remove.
// Only the three keys the client needs are published; the database URL is not.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
if (!process.env.SUPABASE_JWT_SECRET) process.env.SUPABASE_JWT_SECRET = JWT_SECRET;

const RUN = process.env.CBT_LIVE === "1";

/** Never point a live write-capable test at production. */
const IS_STAGING = REF === "noyegdgrfzopfrwjunot";

async function rest(query: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  let rows: number | null = null;
  try {
    const body = await res.json();
    if (Array.isArray(body)) rows = body.length;
  } catch {
    /* error bodies are not JSON */
  }
  return { status: res.status, rows };
}

describe.skipIf(!RUN)("tenant-scoped client over the real transport", () => {
  let bigSchool: { school_id: string; n: number };
  let smallSchool: { school_id: string; n: number };

  beforeAll(async () => {
    // Fail loudly rather than skipping: if the operator asked for live tests,
    // a missing prerequisite is a failure, not a silent pass.
    expect(IS_STAGING, `refusing to run against '${REF}' — staging only`).toBe(true);
    expect(JWT_SECRET, "SUPABASE_JWT_SECRET is required for live tests").not.toBe("");
    expect(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required to establish ground truth").not.toBe("");

    // Ground truth via the service-role client: it bypasses RLS, so these counts
    // are the real ones and the assertions below cannot pass vacuously.
    const service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service
      .from("profiles")
      .select("school_id")
      .not("school_id", "is", null)
      .limit(5000);
    expect(error, error?.message).toBeNull();

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.school_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const ranked = [...counts.entries()]
      .map(([school_id, n]) => ({ school_id, n }))
      .sort((a, b) => b.n - a.n);

    expect(ranked.length, "need two schools with profiles").toBeGreaterThanOrEqual(2);
    bigSchool = ranked[0];
    smallSchool = ranked[1];
  });

  it("reports the client as configured once the secret exists", () => {
    expect(isTenantClientConfigured()).toBe(true);
  });

  it("mints a token accepted by PostgREST, scoped to exactly one school", async () => {
    const client = await createTenantScopedClient({
      userId: "00000000-0000-0000-0000-0000000000aa",
      schoolId: bigSchool.school_id,
      appRole: "teacher",
    });

    // Through the real client, not a hand-rolled request: this is the code path
    // every CBT route uses.
    const { data, error } = await client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(bigSchool.n);

    const other = await createTenantScopedClient({
      userId: "00000000-0000-0000-0000-0000000000ab",
      schoolId: smallSchool.school_id,
      appRole: "teacher",
    });
    const otherRead = await other.from("profiles").select("id");
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toHaveLength(smallSchool.n);
  });

  it("cannot read another school's rows", async () => {
    const token = await mintTenantToken({
      userId: "00000000-0000-0000-0000-0000000000aa",
      schoolId: bigSchool.school_id,
      appRole: "teacher",
    });
    const cross = await rest(`profiles?select=id&school_id=eq.${smallSchool.school_id}`, token);
    expect(cross.rows).toBe(0);
  });

  it("grants an anonymous request nothing", async () => {
    const anon = await rest("profiles?select=id", ANON_KEY);
    expect(anon.rows).toBe(0);
  });

  it("has its signature genuinely checked, not merely its claims read", async () => {
    // If PostgREST ignored the signature, this forged token would be accepted.
    const wrongSecret = crypto.randomBytes(64).toString("base64");
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({
      school_id: bigSchool.school_id,
      role: "authenticated",
      app_role: "teacher",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("00000000-0000-0000-0000-0000000000aa")
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(new TextEncoder().encode(wrongSecret));

    const res = await rest("profiles?select=id", forged);
    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      school_id: bigSchool.school_id,
      role: "authenticated",
      app_role: "teacher",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("00000000-0000-0000-0000-0000000000aa")
      .setAudience("authenticated")
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(JWT_SECRET));

    const res = await rest("profiles?select=id", expired);
    expect(res.status).toBe(401);
  });
});
