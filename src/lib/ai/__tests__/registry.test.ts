import { describe, it, expect } from "vitest";
import { buildRoutes, loadEnabledModels, loadEnabledProviders, loadRoutes } from "../registry";
import { AiConfigurationError, type AiModelRow, type AiProviderRow } from "../types";
import { fakeSupabase, fakeError, fakeOk } from "./fake-supabase";

const provider = (over: Partial<AiProviderRow> = {}): AiProviderRow => ({
  id: "p1",
  name: "p1",
  label: "P1",
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
  model: "m1",
  is_enabled: true,
  priority: 10,
  max_output_tokens: 4096,
  ...over,
});

describe("buildRoutes", () => {
  it("returns nothing when there is nothing to route", () => {
    // Precondition asserted, so this cannot pass by the list being non-empty.
    expect(buildRoutes([], [])).toEqual([]);
  });

  it("drops a model whose provider is disabled", () => {
    const disabled = [provider({ is_enabled: false })];
    const models = [model()];
    expect(models).toHaveLength(1);

    expect(buildRoutes(disabled, models)).toEqual([]);

    // Positive control: the same pair with the provider enabled DOES route, so
    // the assertion above is about the disabled flag, not about a broken join.
    const enabled = [provider({ is_enabled: true })];
    expect(buildRoutes(enabled, models)).toHaveLength(1);
  });

  it("drops a model that is itself disabled, with its provider enabled", () => {
    const providers = [provider({ is_enabled: true })];
    expect(buildRoutes(providers, [model({ is_enabled: false })])).toEqual([]);
    expect(buildRoutes(providers, [model({ is_enabled: true })])).toHaveLength(1);
  });

  it("drops a model whose provider is not in the list at all", () => {
    const routes = buildRoutes([provider({ id: "other" })], [model({ provider_id: "p1" })]);
    expect(routes).toEqual([]);
  });

  it("orders by provider priority first", () => {
    const providers = [
      provider({ id: "late", name: "late", priority: 50 }),
      provider({ id: "early", name: "early", priority: 5 }),
    ];
    const models = [
      model({ id: "m-late", provider_id: "late", model: "late-model" }),
      model({ id: "m-early", provider_id: "early", model: "early-model" }),
    ];

    const routes = buildRoutes(providers, models);
    expect(routes.map((r) => r.provider.name)).toEqual(["early", "late"]);
  });

  it("orders by model priority within a provider", () => {
    const providers = [provider({ id: "p1", name: "p1" })];
    const models = [
      model({ id: "second", model: "second", priority: 20 }),
      model({ id: "first", model: "first", priority: 1 }),
    ];

    const routes = buildRoutes(providers, models);
    expect(routes.map((r) => r.model.model)).toEqual(["first", "second"]);
  });

  it("breaks ties deterministically, so a fallback order is reproducible", () => {
    const providers = [
      provider({ id: "z", name: "zeta", priority: 10 }),
      provider({ id: "a", name: "alpha", priority: 10 }),
    ];
    const models = [
      model({ id: "mz", provider_id: "z", model: "zm" }),
      model({ id: "ma", provider_id: "a", model: "am" }),
    ];

    const routes = buildRoutes(providers, models);
    expect(routes.map((r) => r.provider.name)).toEqual(["alpha", "zeta"]);
  });

  it("produces the same order from a shuffled input", () => {
    const providers = [
      provider({ id: "b", name: "b", priority: 10 }),
      provider({ id: "a", name: "a", priority: 10 }),
      provider({ id: "c", name: "c", priority: 10 }),
    ];
    const models = [
      model({ id: "mb", provider_id: "b", model: "m" }),
      model({ id: "ma", provider_id: "a", model: "m" }),
      model({ id: "mc", provider_id: "c", model: "m" }),
    ];

    const forward = buildRoutes(providers, models).map((r) => r.provider.name);
    const backward = buildRoutes([...providers].reverse(), [...models].reverse()).map(
      (r) => r.provider.name,
    );

    expect(forward).toEqual(["a", "b", "c"]);
    expect(backward).toEqual(forward);
  });
});

describe("loadEnabledProviders", () => {
  it("asks only for enabled providers", async () => {
    const fake = fakeSupabase({
      select: () =>
        fakeOk([
          {
            id: "p1",
            name: "deepseek",
            label: "DeepSeek",
            kind: "openai_compatible",
            base_url: "https://api.deepseek.com",
            api_key_env: "DEEPSEEK_API_KEY",
            is_enabled: true,
            priority: 10,
          },
        ]),
    });

    const providers = await loadEnabledProviders(fake.client);
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("deepseek");
    expect(fake.selects[0].table).toBe("ai_providers");
    expect(fake.selects[0].filters).toContainEqual(["is_enabled", true]);
  });

  it("raises a configuration error when the read fails", async () => {
    const fake = fakeSupabase({ select: () => fakeError("permission denied") });

    const err = await loadEnabledProviders(fake.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiConfigurationError);
    expect((err as Error).message).toContain("permission denied");
  });
});

describe("loadEnabledModels", () => {
  it("filters by capability as well as by enabled", async () => {
    const fake = fakeSupabase({ select: () => fakeOk([]) });

    await loadEnabledModels(fake.client, "vision");

    expect(fake.selects[0].table).toBe("ai_provider_models");
    expect(fake.selects[0].filters).toContainEqual(["capability", "vision"]);
    expect(fake.selects[0].filters).toContainEqual(["is_enabled", true]);
  });

  it("raises a configuration error when the read fails", async () => {
    const fake = fakeSupabase({ select: () => fakeError("boom") });
    const err = await loadEnabledModels(fake.client, "text").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiConfigurationError);
  });
});

describe("loadRoutes", () => {
  it("joins the two reads into ordered routes", async () => {
    const fake = fakeSupabase({
      select: (spec) => {
        if (spec.table === "ai_providers") {
          return fakeOk([
            provider({ id: "p1", name: "deepseek", priority: 10 }),
            provider({ id: "p2", name: "backup", priority: 20 }),
          ]);
        }
        return fakeOk([
          model({ id: "m1", provider_id: "p1", model: "deepseek-chat" }),
          model({ id: "m2", provider_id: "p2", model: "backup-model" }),
        ]);
      },
    });

    const routes = await loadRoutes(fake.client, "text");
    expect(routes.map((r) => r.provider.name)).toEqual(["deepseek", "backup"]);
  });

  it("returns an empty list when nothing is enabled, without throwing", async () => {
    // "AI is off" is a state, not an error.
    const fake = fakeSupabase({ select: () => fakeOk([]) });
    const routes = await loadRoutes(fake.client, "text");
    expect(routes).toEqual([]);
  });
});
