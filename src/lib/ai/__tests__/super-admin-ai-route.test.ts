import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSupabase, fakeError, fakeOk, type FakeOptions } from "./fake-supabase";

/**
 * Tests for the Super Admin AI provider API — the route the AI Settings screen
 * writes through. Until this file it had no coverage at all, and it is the one
 * place that can change which provider serves which capability.
 *
 * What is asserted here is deliberately not "it returns 200":
 *
 *   - the API key never reaches the response, only the boolean `key_configured`
 *   - every validation rule returns 400 with a message naming the field
 *   - a duplicate is a 400 a user can act on, not a 500
 *   - an unknown id is a 404, and nothing is written
 */

const { verifySuperAdminMock, getServiceClientMock } = vi.hoisted(() => ({
  verifySuperAdminMock: vi.fn(),
  getServiceClientMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ verifySuperAdmin: verifySuperAdminMock }));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: getServiceClientMock }));

import { GET, POST, PUT } from "@/app/api/super-admin/ai/providers/route";

const PROVIDER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "deepseek",
  label: "DeepSeek",
  kind: "openai_compatible",
  base_url: "https://api.deepseek.com",
  api_key_env: "TEST_PROVIDER_KEY",
  is_enabled: true,
  priority: 10,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const MODEL = {
  id: "22222222-2222-2222-2222-222222222222",
  provider_id: PROVIDER.id,
  capability: "text",
  model: "deepseek-flash",
  is_enabled: true,
  priority: 10,
  max_output_tokens: 4096,
  created_at: "2026-01-01T00:00:00.000Z",
};

function wire(options: FakeOptions = {}, role: "authorized" | "unauthorized" = "authorized") {
  verifySuperAdminMock.mockResolvedValue(
    role === "authorized" ? { authorized: true, userId: "u1" } : { authorized: false, userId: null },
  );
  const fake = fakeSupabase(options);
  getServiceClientMock.mockReturnValue(fake.client);
  return fake;
}

const getRequest = () =>
  new Request("http://localhost/api/super-admin/ai/providers", { method: "GET" });

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/super-admin/ai/providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/super-admin/ai/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("TEST_PROVIDER_KEY", "the-real-secret-value");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("authorization", () => {
  it("refuses with 401 on every verb when the caller is not a super admin", async () => {
    wire({}, "unauthorized");

    for (const call of [
      () => GET(getRequest()),
      () => PUT(putRequest({ provider_id: PROVIDER.id, priority: 5 })),
      () => POST(postRequest({ name: "gemini", label: "Gemini" })),
    ]) {
      const res = await call();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
  });
});

describe("GET", () => {
  it("nests each provider's models and reports whether its key env var is set", async () => {
    wire({
      select: (spec) => (spec.table === "ai_providers" ? fakeOk([PROVIDER]) : fakeOk([MODEL])),
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as { providers: Array<Record<string, unknown>> };
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].name).toBe("deepseek");
    expect(body.providers[0].key_configured).toBe(true);
    expect(body.providers[0].models).toEqual([MODEL]);
  });

  it("reports key_configured false when the variable is not set", async () => {
    vi.stubEnv("TEST_PROVIDER_KEY", "");
    wire({
      select: (spec) => (spec.table === "ai_providers" ? fakeOk([PROVIDER]) : fakeOk([])),
    });

    const body = (await (await GET(getRequest())).json()) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(body.providers[0].key_configured).toBe(false);
  });

  it("never puts the key itself in the response, only the boolean", async () => {
    wire({
      select: (spec) => (spec.table === "ai_providers" ? fakeOk([PROVIDER]) : fakeOk([MODEL])),
    });

    const raw = await (await GET(getRequest())).text();

    // Precondition: the env var really was set, so the assertion below is about
    // the route withholding it rather than about it never existing.
    expect(process.env.TEST_PROVIDER_KEY).toBe("the-real-secret-value");
    expect(raw).toContain("key_configured");
    expect(raw).not.toContain("the-real-secret-value");
  });

  it("surfaces a read failure as a 500 rather than an empty list", async () => {
    wire({ select: () => fakeError("permission denied") });
    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("permission denied");
  });
});

describe("PUT — which row, and validation", () => {
  it("refuses a body that identifies both a provider and a model", async () => {
    wire();
    const res = await PUT(putRequest({ provider_id: PROVIDER.id, model_id: MODEL.id, priority: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not both");
  });

  it("refuses a body that identifies neither", async () => {
    wire();
    const res = await PUT(putRequest({ priority: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("required");
  });

  it("refuses a body with nothing to update", async () => {
    wire();
    const res = await PUT(putRequest({ provider_id: PROVIDER.id }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Nothing to update");
  });

  it("refuses a malformed provider id, naming the field", async () => {
    wire();
    const res = await PUT(putRequest({ provider_id: "not-a-uuid", priority: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("provider_id");
  });

  it("refuses an insecure base_url", async () => {
    wire();
    const res = await PUT(
      putRequest({ provider_id: PROVIDER.id, base_url: "http://api.example.com" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("https://");
  });

  it("refuses an api_key_env that is not an environment variable name", async () => {
    wire();
    const res = await PUT(putRequest({ provider_id: PROVIDER.id, api_key_env: "not a var name" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("api_key_env");
  });

  it("refuses a priority outside the allowed range", async () => {
    wire();
    const res = await PUT(putRequest({ provider_id: PROVIDER.id, priority: 5000 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("priority");
  });

  it("writes ONLY the fields it was given", async () => {
    const fake = wire({
      update: (spec) => fakeOk({ ...PROVIDER, ...spec.row }),
    });

    const res = await PUT(putRequest({ provider_id: PROVIDER.id, priority: 30 }));
    expect(res.status).toBe(200);

    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0].table).toBe("ai_providers");
    expect(fake.updates[0].filters).toContainEqual(["id", PROVIDER.id]);

    // `priority` plus the route's own `updated_at` — and nothing else, so an
    // absent field can never be silently blanked.
    expect(Object.keys(fake.updates[0].row).sort()).toEqual(["priority", "updated_at"]);
  });

  it("returns 404 for an id that does not exist, and writes nothing", async () => {
    const fake = wire({ update: () => fakeOk(null) });

    const res = await PUT(putRequest({ provider_id: PROVIDER.id, priority: 30 }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("not found");
    expect(fake.updates).toHaveLength(1); // attempted...
  });

  it("turns a duplicate model name into a 400 a user can act on, not a 500", async () => {
    wire({ update: () => fakeError("duplicate key value", "23505") });

    const res = await PUT(putRequest({ model_id: MODEL.id, model: "deepseek-flash" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("already exists");
  });

  it("keeps a non-duplicate write failure as a 500", async () => {
    wire({ update: () => fakeError("connection terminated", "08006") });

    const res = await PUT(putRequest({ provider_id: PROVIDER.id, priority: 30 }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("connection terminated");
  });
});

describe("POST — creating a provider or a model", () => {
  it("creates a provider as enabled=false unless told otherwise", async () => {
    const fake = wire({
      select: (spec) => (spec.table === "ai_providers" ? fakeOk(null) : fakeOk([])),
      insert: () => fakeOk({ ...PROVIDER, name: "gemini" }),
    });

    const res = await POST(
      postRequest({
        name: "gemini",
        label: "Gemini",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        api_key_env: "GEMINI_API_KEY",
      }),
    );

    expect(res.status).toBe(201);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0].table).toBe("ai_providers");
    // "Nothing turns AI on by accident" — new rows arrive switched off.
    expect(fake.inserts[0].row.is_enabled ?? false).toBe(false);
    expect(fake.inserts[0].row.kind).toBe("openai_compatible");
  });

  it("refuses a provider name that is not a lowercase slug", async () => {
    wire();
    const res = await POST(
      postRequest({
        name: "Gemini Vision",
        label: "Gemini",
        base_url: "https://example.com",
        api_key_env: "GEMINI_API_KEY",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("slug");
  });

  it("refuses a new model whose capability is not one of the four", async () => {
    wire();
    const res = await POST(
      postRequest({ provider_id: PROVIDER.id, capability: "audio", model: "x" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("capability");
  });

  it("returns 404 when adding a model to a provider that does not exist", async () => {
    wire({ select: () => fakeOk(null) });

    const res = await POST(
      postRequest({ provider_id: PROVIDER.id, capability: "vision", model: "deepseek-flash" }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("Provider not found");
  });

  it("turns a duplicate provider name into a 400", async () => {
    wire({
      select: () => fakeOk(null),
      insert: () => fakeError("duplicate key value", "23505"),
    });

    const res = await POST(
      postRequest({
        name: "deepseek",
        label: "DeepSeek",
        base_url: "https://api.deepseek.com",
        api_key_env: "DEEPSEEK_API_KEY",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("already exists");
  });
});
