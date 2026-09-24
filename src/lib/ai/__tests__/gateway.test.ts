import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { outcomeNotice, runAiCall, type AiGatewayRequest } from "../gateway";
import type { AiModelRow, AiProviderRow } from "../types";
import { fakeSupabase, fakeError, fakeOk } from "./fake-supabase";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const provider = (over: Partial<AiProviderRow> = {}): AiProviderRow => ({
  id: "p1",
  name: "deepseek",
  label: "DeepSeek",
  kind: "openai_compatible",
  base_url: "https://api.example.com",
  api_key_env: "TEST_AI_KEY",
  is_enabled: true,
  priority: 10,
  ...over,
});

const model = (over: Partial<AiModelRow> = {}): AiModelRow => ({
  id: "m1",
  provider_id: "p1",
  capability: "text",
  model: "deepseek-chat",
  is_enabled: true,
  priority: 10,
  max_output_tokens: 4096,
  ...over,
});

type HarnessOptions = {
  providers?: AiProviderRow[];
  models?: AiModelRow[];
  balance?: number | "error";
  charge?: number | "error";
  configureError?: string;
  /** Default true: most tests are about what happens AFTER a school is entitled. */
  aiEnabled?: boolean;
  entitlementError?: string;
  providerResponses?: Array<Response | (() => Response)>;
};

function harness(options: HarnessOptions = {}) {
  const providers = options.providers ?? [provider()];
  const models = options.models ?? [model()];
  const fetched: string[] = [];

  const fake = fakeSupabase({
    select: (spec) => {
      // The school-entitlement read is answered first and separately, so a test
      // about a broken provider configuration is not masked by the gate.
      if (spec.table === "school_features") {
        if (options.entitlementError) return fakeError(options.entitlementError);
        return fakeOk(options.aiEnabled === false ? [] : [{ is_enabled: true }]);
      }
      if (options.configureError) return fakeError(options.configureError);
      if (spec.table === "ai_providers") return fakeOk(providers);
      if (spec.table === "ai_provider_models") return fakeOk(models);
      return fakeOk([]);
    },
    rpc: (name) => {
      if (name === "ai_credit_balance") {
        return options.balance === "error" ? fakeError("no balance") : fakeOk(options.balance ?? 100);
      }
      if (name === "charge_ai_credits") {
        return options.charge === "error" ? fakeError("Insufficient AI credits: 0, 1 required") : fakeOk(options.charge ?? 1);
      }
      return fakeOk(null);
    },
  });

  const responses = options.providerResponses ?? [
    new Response(
      JSON.stringify({
        model: "deepseek-chat",
        choices: [{ message: { content: "generated" } }],
        usage: { prompt_tokens: 40, completion_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ];

  const fetchImpl = (async (url: unknown) => {
    fetched.push(String(url));
    const next = responses[Math.min(fetched.length - 1, responses.length - 1)];
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;

  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("TEST_AI_KEY", "test-key");

  const usageRows = () => fake.inserts.filter((i) => i.table === "ai_usage_events").map((i) => i.row);
  const charged = () => fake.rpcs.filter((r) => r.name === "charge_ai_credits");

  return { fake, fetched, usageRows, charged };
}

const chatRequest = (
  supabase: SupabaseClient,
  over: { schoolId?: string; feature?: string } = {},
): AiGatewayRequest => ({
  supabase,
  schoolId: over.schoolId ?? SCHOOL,
  capability: "text",
  messages: [{ role: "user", content: "hello" }],
  ...(over.feature ? { feature: over.feature } : {}),
});

describe("runAiCall — refusals", () => {
  it("refuses a school that has not been granted AI, even with providers configured", async () => {
    // The harness configures a working provider by default, so a refusal here
    // proves the school gate takes precedence rather than passing on an empty setup.
    const h = harness({ aiEnabled: false });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome).toEqual({
      status: "refused_disabled",
      reason: "AI features are not enabled for this school",
    });
    expect(h.fetched).toHaveLength(0);
    expect(h.charged()).toHaveLength(0);
    expect(h.usageRows()).toHaveLength(1);
    expect(h.usageRows()[0].status).toBe("refused_disabled");
  });

  it("fails, rather than allowing AI, when the school's entitlement cannot be read", async () => {
    const h = harness({ entitlementError: "permission denied for table school_features" });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.error).toContain("permission denied");
    expect(h.fetched).toHaveLength(0);
    expect(h.charged()).toHaveLength(0);
  });

  it("refuses when AI is switched off, and never reaches a provider", async () => {
    const h = harness({ providers: [], models: [] });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("refused_disabled");
    // The precondition that makes this meaningful: a request WAS made, and the
    // absence of a provider call is because of the refusal, not a broken test.
    expect(h.fetched).toHaveLength(0);
    expect(h.charged()).toHaveLength(0);
    expect(h.usageRows()).toHaveLength(1);
    expect(h.usageRows()[0].status).toBe("refused_disabled");
    expect(h.usageRows()[0].school_id).toBe(SCHOOL);
  });

  it("refuses when the provider row is enabled but the school's data says otherwise", async () => {
    // Enabling a model does not enable its provider: the join must drop it.
    const h = harness({ providers: [provider({ is_enabled: false })], models: [model()] });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("refused_disabled");
    expect(h.fetched).toHaveLength(0);
  });

  it("refuses a school with no credits, before spending anything", async () => {
    const h = harness({ balance: 0 });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome).toEqual({ status: "refused_no_credits", balance: 0 });
    expect(h.fetched).toHaveLength(0);
    expect(h.charged()).toHaveLength(0);
    expect(h.usageRows()[0].status).toBe("refused_no_credits");
  });

  it("refuses a school that cannot cover even the fixed part of the price", async () => {
    const h = harness({ balance: 0.5 });

    const outcome = await runAiCall(chatRequest(h.fake.client));
    expect(outcome.status).toBe("refused_no_credits");
    expect(h.fetched).toHaveLength(0);
  });

  it("fails, rather than pretending AI is off, when configuration cannot be read", async () => {
    const h = harness({ configureError: "permission denied" });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.error).toContain("permission denied");
    expect(outcome.attempts).toEqual([]);
    expect(h.usageRows()[0].status).toBe("failed");
  });

  it("fails when the balance cannot be read, rather than spending blind", async () => {
    const h = harness({ balance: "error" });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("failed");
    expect(h.fetched).toHaveLength(0);
    expect(h.charged()).toHaveLength(0);
  });
});

describe("runAiCall — success", () => {
  it("calls the provider, charges one credit and records what happened", async () => {
    const h = harness({ balance: 100 });

    const outcome = await runAiCall(chatRequest(h.fake.client, { feature: "question_generation" }));

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") throw new Error("unreachable");
    expect(outcome.result.kind).toBe("chat");
    expect(outcome.result.kind === "chat" && outcome.result.text).toBe("generated");
    expect(outcome.provider).toBe("deepseek");
    expect(outcome.model).toBe("deepseek-chat");
    expect(outcome.creditsCharged).toBe(1);
    expect(outcome.attempts).toHaveLength(1);

    expect(h.fetched).toEqual(["https://api.example.com/chat/completions"]);
    expect(h.charged()).toEqual([
      { name: "charge_ai_credits", args: { p_school_id: SCHOOL, p_amount: 1 } },
    ]);

    const row = h.usageRows()[0];
    expect(row.status).toBe("success");
    expect(row.school_id).toBe(SCHOOL);
    expect(row.feature).toBe("question_generation");
    expect(row.provider_name).toBe("deepseek");
    expect(row.model).toBe("deepseek-chat");
    expect(row.credits_charged).toBe(1);
    expect(row.input_units).toBe(40);
    expect(row.output_units).toBe(20);
    expect(row.error).toBeNull();
  });

  it("records the tenant it was given, and only for that tenant", async () => {
    const h = harness({ balance: 100 });

    await runAiCall(chatRequest(h.fake.client, { schoolId: OTHER_SCHOOL }));

    expect(h.usageRows()).toHaveLength(1);
    expect(h.usageRows()[0].school_id).toBe(OTHER_SCHOOL);
    expect(h.charged()[0].args.p_school_id).toBe(OTHER_SCHOOL);
  });

  it("dispatches text_to_speech to the speech endpoint and returns bytes", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const h = harness({
      models: [model({ capability: "text_to_speech", model: "tts-1" })],
      providerResponses: [
        new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } }),
      ],
    });

    const outcome = await runAiCall({
      supabase: h.fake.client,
      schoolId: SCHOOL,
      capability: "text_to_speech",
      input: "say this",
    });

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") throw new Error("unreachable");
    expect(outcome.result.kind).toBe("speech");
    if (outcome.result.kind !== "speech") throw new Error("unreachable");
    expect(Array.from(outcome.result.audio)).toEqual([1, 2, 3]);
    expect(outcome.result.mimeType).toBe("audio/mpeg");
    expect(h.fetched[0]).toBe("https://api.example.com/audio/speech");
  });
});

describe("runAiCall — fallback", () => {
  it("uses the second provider when the first is broken, and says so", async () => {
    const h = harness({
      providers: [
        provider({ id: "p1", name: "primary", priority: 10 }),
        provider({ id: "p2", name: "backup", priority: 20, base_url: "https://backup.example.com" }),
      ],
      models: [
        model({ id: "m1", provider_id: "p1", model: "primary-model" }),
        model({ id: "m2", provider_id: "p2", model: "backup-model" }),
      ],
      providerResponses: [
        new Response(JSON.stringify({ error: "overloaded" }), { status: 503 }),
        new Response(
          JSON.stringify({
            model: "backup-model",
            choices: [{ message: { content: "from backup" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ],
    });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") throw new Error("unreachable");
    expect(outcome.provider).toBe("backup");
    expect(outcome.result.kind === "chat" && outcome.result.text).toBe("from backup");
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts[0]).toMatchObject({ provider: "primary", ok: false, status: 503 });
    expect(outcome.attempts[1]).toMatchObject({ provider: "backup", ok: true });

    expect(h.fetched).toEqual([
      "https://api.example.com/chat/completions",
      "https://backup.example.com/chat/completions",
    ]);
    // Charged once, for one answer - not once per provider.
    expect(h.charged()).toHaveLength(1);
    expect(h.usageRows()[0].provider_name).toBe("backup");
  });

  it("stops at a fatal error instead of re-sending a bad request", async () => {
    const h = harness({
      providers: [
        provider({ id: "p1", name: "primary", priority: 10 }),
        provider({ id: "p2", name: "backup", priority: 20 }),
      ],
      models: [
        model({ id: "m1", provider_id: "p1" }),
        model({ id: "m2", provider_id: "p2" }),
      ],
      providerResponses: [new Response(JSON.stringify({ error: "bad request" }), { status: 400 })],
    });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("failed");
    // Two providers were configured; a 400 is the request's fault, so exactly one
    // call was made. End-to-end proof that the classification reaches the loop.
    expect(h.fetched).toHaveLength(1);
    expect(h.charged()).toHaveLength(0);

    const row = h.usageRows()[0];
    expect(row.status).toBe("failed");
    expect(String(row.error)).toContain("attempts:");
    expect(String(row.error)).toContain("primary");
  });

  it("reports every provider it tried when all of them fail", async () => {
    const h = harness({
      providers: [
        provider({ id: "p1", name: "primary", priority: 10 }),
        provider({ id: "p2", name: "backup", priority: 20 }),
      ],
      models: [
        model({ id: "m1", provider_id: "p1" }),
        model({ id: "m2", provider_id: "p2" }),
      ],
      providerResponses: [new Response("down", { status: 502 })],
    });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.attempts).toHaveLength(2);
    expect(h.fetched).toHaveLength(2);
    expect(h.charged()).toHaveLength(0);
  });
});

describe("runAiCall — settling the charge", () => {
  it("still returns the answer when the charge could not be settled, and records it", async () => {
    // Chosen deliberately: the answer is already produced, and giving away one
    // call is bounded, while a reservation that fails to release would lock a
    // school out of a feature it paid for. The record makes the loss visible.
    const h = harness({ balance: 100, charge: "error" });

    const outcome = await runAiCall(chatRequest(h.fake.client));

    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") throw new Error("unreachable");
    expect(outcome.creditsCharged).toBe(0);

    const row = h.usageRows()[0];
    expect(row.status).toBe("success");
    expect(row.credits_charged).toBe(0);
    expect(String(row.error)).toContain("Not charged");
  });
});

describe("outcomeNotice", () => {
  it("says nothing about a success", () => {
    expect(
      outcomeNotice({
        status: "success",
        result: { kind: "chat", text: "x", model: "m", provider: "p" },
        provider: "p",
        model: "m",
        creditsCharged: 1,
        attempts: [],
      }),
    ).toBeNull();
  });

  it("gives a user-facing reason for each refusal", () => {
    expect(outcomeNotice({ status: "refused_disabled", reason: "no provider" })).toContain("not enabled");
    expect(outcomeNotice({ status: "refused_no_credits", balance: 0 })).toContain("run out");
    expect(outcomeNotice({ status: "failed", error: "x", attempts: [] })).toContain("try again");
  });
});
