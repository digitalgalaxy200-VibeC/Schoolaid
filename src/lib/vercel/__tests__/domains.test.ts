import { describe, it, expect, vi, afterEach } from "vitest";
import { addDomain, getDomain, getDomainConfig, removeDomain, vercelConfigured } from "../domains";

/**
 * Transport tests with a mocked host.
 *
 * Two promises are being pinned here, and both are made to a Super Admin rather
 * than to the compiler:
 *
 *   1. WITH NO CREDENTIALS the integration is inert, not broken — every call
 *      answers "not configured" and nothing is attempted over the network. This
 *      is what let the whole feature be built before the token existed.
 *   2. WITH CREDENTIALS the request that leaves is the right one (method, path,
 *      bearer token, body), and the host's own sentence is what a person ends up
 *      reading when it refuses.
 *
 * The mock records its own call arguments, typed, so the assertions do not have
 * to cast their way past `vi.fn()`'s inferred empty parameter list.
 */

const ENV = ["VERCEL_API_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "VERCEL_BRANCH"] as const;

type FetchCall = [url: string, init: RequestInit | undefined];

function mockFetch(handler: () => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const spy = vi.fn((url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return Promise.resolve().then(handler);
  });
  vi.stubGlobal("fetch", spy);
  return { spy, calls };
}

function configure() {
  process.env.VERCEL_API_TOKEN = "tok_test";
  process.env.VERCEL_PROJECT_ID = "schoolaid";
}

afterEach(() => {
  for (const key of ENV) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("with no credentials", () => {
  it("reports itself unconfigured and attempts nothing", async () => {
    const { spy } = mockFetch(() => new Response("{}"));

    expect(vercelConfigured()).toBe(false);

    const results = [
      await addDomain("x.com"),
      await getDomain("x.com"),
      await getDomainConfig("x.com"),
      await removeDomain("x.com"),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.notConfigured).toBe(true);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("with credentials", () => {
  it("registers a domain on the project with the name in the body", async () => {
    configure();
    const { calls } = mockFetch(() => new Response(JSON.stringify({ verified: false }), { status: 200 }));

    const result = await addDomain("schoola.com");

    expect(result.ok).toBe(true);
    const [url, init] = calls[0];
    expect(url).toBe("https://api.vercel.com/v10/projects/schoolaid/domains");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "schoola.com" });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok_test");
  });

  it("reads a domain's state and its config from the documented paths", async () => {
    configure();
    const { calls } = mockFetch(() => new Response("{}", { status: 200 }));

    await getDomain("schoola.com");
    await getDomainConfig("schoola.com");

    expect(calls[0][0]).toBe("https://api.vercel.com/v9/projects/schoolaid/domains/schoola.com");
    expect(calls[1][0]).toBe("https://api.vercel.com/v6/domains/schoola.com/config");
  });

  it("scopes the request to the team when one is configured", async () => {
    configure();
    process.env.VERCEL_TEAM_ID = "team_123";
    const { calls } = mockFetch(() => new Response("{}", { status: 200 }));

    await getDomain("schoola.com");

    expect(calls[0][0]).toContain("teamId=team_123");
  });

  it("attaches the domain to a branch when this environment is not production", async () => {
    // A domain added to a project serves PRODUCTION by default, so staging needs
    // to say which branch it means — otherwise the test registers against the
    // wrong deployment and the wrong database.
    configure();
    process.env.VERCEL_BRANCH = "staging";
    const { calls } = mockFetch(() => new Response("{}", { status: 200 }));

    await addDomain("test.schoolaid.online");

    const [url, init] = calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "test.schoolaid.online",
      gitBranch: "staging",
    });
    // The branch rides in the body on create, not in the query string.
    expect(url).not.toContain("gitBranch");
  });

  it("carries the branch on reads and removals too, so one environment cannot touch another's", async () => {
    configure();
    process.env.VERCEL_BRANCH = "staging";
    const { calls } = mockFetch(() => new Response("{}", { status: 200 }));

    await getDomain("test.schoolaid.online");
    await removeDomain("test.schoolaid.online");

    expect(calls[0][0]).toContain("gitBranch=staging");
    expect(calls[1][0]).toContain("gitBranch=staging");
    expect(calls[1][1]?.method).toBe("DELETE");
  });

  it("says nothing about a branch in production", async () => {
    configure(); // no VERCEL_BRANCH
    const { calls } = mockFetch(() => new Response("{}", { status: 200 }));

    await addDomain("schoola.com");

    expect(calls[0][0]).not.toContain("gitBranch");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ name: "schoola.com" });
  });

  it("surfaces the host's own sentence when it refuses", async () => {
    configure();
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { message: "Domain is already in use by another project" } }),
          { status: 409 },
        ),
    );

    const result = await addDomain("taken.com");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Domain is already in use by another project");
      expect(result.status).toBe(409);
      expect(result.notConfigured).toBeUndefined();
    }
  });

  it("does not throw when the host is unreachable", async () => {
    configure();
    mockFetch(() => {
      throw new Error("getaddrinfo ENOTFOUND api.vercel.com");
    });

    const result = await getDomain("schoola.com");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Could not reach the website host/);
  });
});
