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

  it("sees both seeded providers, and sees that they are enabled", async () => {
    // Ground truth, read with the service client so RLS cannot hide it.
    const { data, error } = await service
      .from("ai_providers")
      .select("name, is_enabled, base_url, api_key_env, priority")
      .order("priority");

    expect(error, error?.message).toBeNull();

    const deepseek = data?.find((p) => p.name === "deepseek");
    expect(deepseek, "migration 049 seeds DeepSeek").toBeTruthy();
    // 049 seeded it disabled; 052 enabled it. Assert the CURRENT fact, so this
    // test fails loudly if someone switches a provider off by accident.
    expect(deepseek!.is_enabled, "migration 052 enables DeepSeek").toBe(true);
    expect(deepseek!.api_key_env).toBe("DEEPSEEK_API_KEY");
    expect(deepseek!.base_url.startsWith("https://")).toBe(true);

    const groq = data?.find((p) => p.name === "groq");
    expect(groq, "migration 053 seeds Groq").toBeTruthy();
    expect(groq!.api_key_env).toBe("GROQ_API_KEY");

    // DeepSeek is 10, Groq 20 — the order the registry must preserve.
    expect(deepseek!.priority).toBeLessThan(groq!.priority);

    // The key is never a column. Assert the shape, not merely a missing name.
    expect(Object.keys(deepseek!)).not.toContain("api_key");
    expect(Object.keys(deepseek!)).not.toContain("key");
  });

  it("returns exactly the enabled providers, not merely all of them", async () => {
    const { data: all } = await service.from("ai_providers").select("id, is_enabled");
    expect(all!.length, "providers exist to filter").toBeGreaterThan(0);

    const enabled = await loadEnabledProviders(service);
    // Anti-vacuity: with nothing enabled, the loop below would prove nothing.
    expect(enabled.length, "at least one provider is enabled").toBeGreaterThan(0);

    const returned = new Set(enabled.map((p) => p.id));
    for (const row of all!) {
      expect(returned.has(row.id), `${row.id} enabled=${row.is_enabled}`).toBe(!!row.is_enabled);
    }
  });

  it("routes text to DeepSeek first and Groq second — priority, through the real registry", async () => {
    const routes = await loadRoutes(service, "text");
    expect(routes.length, "text has at least one route").toBeGreaterThan(0);

    // Ordered by provider priority, so the sequence is deterministic.
    expect(routes[0].provider.name).toBe("deepseek");
    expect(routes[0].model.model).toBe("deepseek-flash");
    expect(
      routes.some((r) => r.provider.name === "groq"),
      "Groq is the configured text fallback",
    ).toBe(true);
  });

  it("routes vision and speech_to_text to different providers, as configured", async () => {
    // Vision is a property of the DeepSeek model, not a separate one.
    const vision = await loadRoutes(service, "vision");
    expect(vision.length).toBeGreaterThan(0);
    expect(vision[0].provider.name).toBe("deepseek");
    expect(vision[0].model.model).toBe("deepseek-flash");

    // Voice goes to Groq and nowhere else — this is the capability that proves
    // per-capability provider choice actually works on real configuration.
    const stt = await loadRoutes(service, "speech_to_text");
    expect(stt.length, "Groq supplies voice to text").toBeGreaterThan(0);
    expect(stt.every((r) => r.provider.name === "groq")).toBe(true);

    // Turbo first (a third of the cost), the full model behind it as the fallback.
    expect(stt[0].model.model).toBe("whisper-large-v3-turbo");
    expect(stt.map((r) => r.model.model)).toContain("whisper-large-v3");
  });

  it("reads the model rows with the columns the registry selects", async () => {
    const { data, error } = await service
      .from("ai_provider_models")
      .select("provider_id, capability, model, is_enabled, priority, max_output_tokens");

    expect(error, error?.message).toBeNull();
    expect(data!.length, "migrations 052/053 seed models").toBeGreaterThan(0);

    // Same columns, same filter, through the registry's own code path.
    const text = await loadEnabledModels(service, "text");
    expect(text.some((m) => m.model === "deepseek-flash")).toBe(true);
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
