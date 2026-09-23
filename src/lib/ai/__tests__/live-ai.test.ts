import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnabledModels, loadEnabledProviders, loadRoutes } from "../registry";
import { aiCreditBalance } from "../credits";
import { runAiCall } from "../gateway";
import { mintTenantToken } from "../../cbt/scoped-client";

/**
 * LIVE tests for the AI gateway's database seam (Phase 21/22).
 *
 *     CBT_LIVE=1 npx vitest run src/lib/ai/__tests__/live-ai.test.ts
 *
 * WHY THESE ARE OPT-IN
 * --------------------
 * They read the staging database and write exactly one usage row, which they
 * delete again. `npm test` must stay offline and deterministic, so these run only
 * when asked.
 *
 * WHAT ONLY THIS FILE CAN PROVE
 * -----------------------------
 * The unit tests run against a fake client, so they prove the gateway's LOGIC and
 * nothing about the schema it talks to. Four claims in particular are made in
 * comments and nowhere else:
 *
 *   1. The column names in `ai_providers` / `ai_provider_models` are the ones the
 *      registry selects. A typo passes every unit test and fails in production.
 *   2. `ai_providers` really is deny-all to a tenant token — the migration asserts
 *      it, but "RLS enabled with no policies" is a claim until someone checks.
 *   3. EXECUTE on the credit functions really is revoked from `authenticated`.
 *      That privilege is the ONLY guard on a SECURITY DEFINER function, so if it
 *      were wrong, any signed-in user could spend any school's credits.
 *   4. `ai_usage_events` accepts the row the gateway writes, including its
 *      status/feature columns and the school foreign key.
 *
 * The positive control is present in each case. "A tenant reads zero rows" is
 * worthless on its own — it is also true of an empty table — so the service-role
 * client reads the same table first and proves the rows are there.
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

if (!process.env.SUPABASE_JWT_SECRET) process.env.SUPABASE_JWT_SECRET = JWT_SECRET;

const RUN = process.env.CBT_LIVE === "1";
const IS_STAGING = REF === "noyegdgrfzopfrwjunot";

async function restRpc(name: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

describe.skipIf(!RUN)("AI gateway over the real transport", () => {
  let service: SupabaseClient;
  let schoolId: string;
  let tenantToken: string;
  const writtenEventIds: string[] = [];

  beforeAll(async () => {
    // Fail loudly rather than skipping: an operator who asked for live tests
    // should not be told they passed when a prerequisite was missing.
    expect(IS_STAGING, `refusing to run against '${REF}' — staging only`).toBe(true);
    expect(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required").not.toBe("");
    expect(JWT_SECRET, "SUPABASE_JWT_SECRET is required").not.toBe("");

    service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await service.from("schools").select("id").limit(1);
    expect(error, error?.message).toBeNull();
    expect(data?.length, "staging needs at least one school").toBeGreaterThan(0);
    schoolId = data![0].id as string;

    tenantToken = await mintTenantToken({
      userId: "00000000-0000-0000-0000-0000000000cc",
      schoolId,
      appRole: "teacher",
    });
  });

  afterAll(async () => {
    // Leave staging exactly as it was found.
    if (writtenEventIds.length > 0) {
      await service.from("ai_usage_events").delete().in("id", writtenEventIds);
    }
  });

  it("sees the seeded provider, and sees that it is disabled", async () => {
    // Ground truth, read with the service client so RLS cannot hide it.
    const { data, error } = await service
      .from("ai_providers")
      .select("name, is_enabled, base_url, api_key_env, priority");
    expect(error, error?.message).toBeNull();

    const deepseek = data?.find((p) => p.name === "deepseek");
    expect(deepseek, "migration 049 seeds DeepSeek").toBeTruthy();
    expect(deepseek!.is_enabled).toBe(false);
    expect(deepseek!.api_key_env).toBe("DEEPSEEK_API_KEY");
    // The key must never be a column. Assert the shape, not just the absence.
    expect(Object.keys(deepseek!)).not.toContain("api_key");
  });

  it("returns no routes because the only provider is disabled, not because the table is empty", async () => {
    const all = await service.from("ai_providers").select("id");
    expect(all.data?.length, "the provider row exists").toBeGreaterThan(0);

    // The positive control above is what makes this assertion mean something.
    const enabled = await loadEnabledProviders(service);
    expect(enabled).toEqual([]);

    const routes = await loadRoutes(service, "text");
    expect(routes).toEqual([]);
  });

  it("reads the model row with the columns the registry selects", async () => {
    const { data, error } = await service
      .from("ai_provider_models")
      .select("provider_id, capability, model, is_enabled, priority, max_output_tokens");

    expect(error, error?.message).toBeNull();
    const chat = data?.find((m) => m.capability === "text");
    expect(chat, "migration 049 seeds a text model").toBeTruthy();
    expect(chat!.model).toBe("deepseek-chat");

    // Same columns, same filter, through the registry's own code path.
    const viaRegistry = await loadEnabledModels(service, "text");
    expect(viaRegistry).toEqual([]); // seeded disabled

    const vision = await loadEnabledModels(service, "vision");
    expect(vision).toEqual([]);
  });

  it("shows a tenant token nothing from the platform configuration tables", async () => {
    // Positive control first: the service client sees rows.
    const svc = await service.from("ai_providers").select("id");
    expect(svc.data!.length).toBeGreaterThan(0);

    const tenant = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tenantToken}` } },
    });

    const read = await tenant.from("ai_providers").select("id");
    expect(read.error, read.error?.message).toBeNull();
    expect(read.data).toEqual([]);

    const models = await tenant.from("ai_provider_models").select("id");
    expect(models.data).toEqual([]);
  });

  it("refuses to let a tenant token execute the credit functions", async () => {
    // The positive control: the service role CAN call it.
    const asService = await aiCreditBalance(service, schoolId);
    expect(typeof asService).toBe("number");

    const asTenant = await restRpc("ai_credit_balance", { p_school_id: schoolId }, tenantToken);
    expect(
      asTenant.status,
      `a tenant token must not execute ai_credit_balance (got ${asTenant.status}: ${asTenant.text.slice(0, 200)})`,
    ).not.toBe(200);

    const chargeAsTenant = await restRpc(
      "charge_ai_credits",
      { p_school_id: schoolId, p_amount: 1 },
      tenantToken,
    );
    expect(chargeAsTenant.status).not.toBe(200);
  });

  it("refuses a call end to end while AI is off, and records that it did", async () => {
    const before = await service
      .from("ai_usage_events")
      .select("id")
      .eq("school_id", schoolId);

    const outcome = await runAiCall({
      supabase: service,
      schoolId,
      capability: "text",
      messages: [{ role: "user", content: "hello" }],
      feature: "live_check",
    });

    expect(outcome.status).toBe("refused_disabled");

    const after = await service
      .from("ai_usage_events")
      .select("id, status, capability, feature, credits_charged, provider_name")
      .eq("school_id", schoolId);

    expect(after.error, after.error?.message).toBeNull();
    expect(after.data!.length).toBe((before.data?.length ?? 0) + 1);

    const row = after.data!.find((r) => r.feature === "live_check");
    expect(row, "the gateway recorded its refusal").toBeTruthy();
    expect(row!.status).toBe("refused_disabled");
    expect(row!.capability).toBe("text");
    expect(Number(row!.credits_charged)).toBe(0);
    // A refusal that spent nothing must name no provider.
    expect(row!.provider_name).toBeNull();

    writtenEventIds.push(row!.id as string);
  });
});
