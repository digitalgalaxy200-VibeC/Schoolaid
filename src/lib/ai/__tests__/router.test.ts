import { describe, it, expect } from "vitest";
import { classifyError, describeAttempts, tryRoutes } from "../router";
import { AiProviderError, type AiRoute } from "../types";

const route = (name: string, model = `${name}-model`): AiRoute => ({
  provider: {
    id: name,
    name,
    label: name,
    kind: "openai_compatible",
    base_url: "https://api.example.com",
    api_key_env: "TEST_AI_KEY",
    is_enabled: true,
    priority: 10,
  },
  model: {
    id: `${name}-m`,
    provider_id: name,
    capability: "text",
    model,
    is_enabled: true,
    priority: 10,
    max_output_tokens: null,
  },
});

const retryableFailure = (provider: string) =>
  new AiProviderError({ provider, message: `${provider} is down`, status: 503, retryable: true });

const fatalFailure = (provider: string) =>
  new AiProviderError({ provider, message: `${provider} rejected the request`, status: 400, retryable: false });

describe("classifyError", () => {
  it("takes the adapter's judgement for a provider error", () => {
    expect(classifyError(retryableFailure("a"))).toEqual({
      retryable: true,
      message: "a is down",
      status: 503,
    });
    expect(classifyError(fatalFailure("a")).retryable).toBe(false);
  });

  it("treats an unexplained error as retryable", () => {
    // A socket reset has no status and no provider; asking another provider is
    // exactly what fallback is for.
    const verdict = classifyError(new TypeError("fetch failed"));
    expect(verdict.retryable).toBe(true);
    expect(verdict.status).toBeNull();
    expect(verdict.message).toBe("fetch failed");
  });

  it("survives a thrown non-Error", () => {
    expect(classifyError("just a string").message).toBe("just a string");
  });
});

describe("tryRoutes", () => {
  it("stops at the first success and reports one attempt", async () => {
    const calls: string[] = [];
    const result = await tryRoutes({
      routes: [route("a"), route("b")],
      attempt: async (r) => {
        calls.push(r.provider.name);
        return `from-${r.provider.name}`;
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toBe("from-a");
    expect(result.route.provider.name).toBe("a");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].ok).toBe(true);
    // Precondition: the second route existed and was deliberately not used.
    expect(calls).toEqual(["a"]);
  });

  it("falls back to the next provider on a retryable failure", async () => {
    const calls: string[] = [];
    const result = await tryRoutes({
      routes: [route("a"), route("b")],
      attempt: async (r) => {
        calls.push(r.provider.name);
        if (r.provider.name === "a") throw retryableFailure("a");
        return "from-b";
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value).toBe("from-b");
    expect(result.route.provider.name).toBe("b");
    expect(calls).toEqual(["a", "b"]);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].ok).toBe(false);
    expect(result.attempts[0].status).toBe(503);
    expect(result.attempts[0].retryable).toBe(true);
    expect(result.attempts[1].ok).toBe(true);
  });

  it("does NOT fall back on a fatal failure", async () => {
    const calls: string[] = [];
    const result = await tryRoutes({
      routes: [route("a"), route("b"), route("c")],
      attempt: async (r) => {
        calls.push(r.provider.name);
        throw fatalFailure(r.provider.name);
      },
    });

    expect(result.ok).toBe(false);
    // One attempt, though three routes were configured: the request is wrong and
    // re-sending it would produce the same answer three times.
    expect(calls).toEqual(["a"]);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].retryable).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toContain("rejected the request");
  });

  it("falls back on a non-provider error", async () => {
    const calls: string[] = [];
    const result = await tryRoutes({
      routes: [route("a"), route("b")],
      attempt: async (r) => {
        calls.push(r.provider.name);
        if (r.provider.name === "a") throw new TypeError("fetch failed");
        return "from-b";
      },
    });

    expect(calls).toEqual(["a", "b"]);
    expect(result.ok).toBe(true);
    expect(result.attempts[0].error).toBe("fetch failed");
  });

  it("reports every attempt when all providers fail", async () => {
    const result = await tryRoutes({
      routes: [route("a"), route("b"), route("c")],
      attempt: async (r) => {
        throw retryableFailure(r.provider.name);
      },
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.map((a) => a.provider)).toEqual(["a", "b", "c"]);
    expect(result.attempts.every((a) => !a.ok)).toBe(true);
    if (result.ok) throw new Error("unreachable");
    // The LAST error is what a user is told, and it names the last provider tried.
    expect(result.error.message).toContain("c is down");
  });

  it("records a non-negative latency for every attempt", async () => {
    const result = await tryRoutes({
      routes: [route("a")],
      attempt: async () => "ok",
    });

    expect(result.attempts[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.attempts[0].latencyMs)).toBe(true);
  });

  it("fails closed with no routes configured, and never calls anything", async () => {
    let called = 0;
    const result = await tryRoutes({
      routes: [],
      attempt: async () => {
        called += 1;
        return "should not happen";
      },
    });

    expect(called).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.attempts).toEqual([]);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toContain("No AI provider is configured");
  });
});

describe("describeAttempts", () => {
  it("says so when nothing was tried", () => {
    expect(describeAttempts([])).toBe("no provider was tried");
  });

  it("names each provider, its status and how it failed", () => {
    const summary = describeAttempts([
      { provider: "a", model: "am", ok: false, status: 503, error: "down", retryable: true, latencyMs: 12 },
      { provider: "b", model: "bm", ok: false, status: 400, error: "bad", retryable: false, latencyMs: 8 },
      { provider: "c", model: "cm", ok: true, latencyMs: 30 },
    ]);

    expect(summary).toContain("a/am HTTP 503");
    expect(summary).toContain("retryable: down");
    expect(summary).toContain("fatal: bad");
    expect(summary).toContain("c/cm");
    expect(summary).toContain("ok");
  });
});
