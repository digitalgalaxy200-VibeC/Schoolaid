import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  authResetErrorMessage,
  classifyAuthUserError,
  setAuthUserPassword,
} from "../auth-users";

/**
 * These tests exist because of a real staging bug: six accounts had malformed
 * auth rows (NULL created_at/tokens, missing auth.identities), so every admin
 * lookup returned 500 "Database error loading user". The reset-password route
 * read that as "user not found", attempted a doomed re-create, and reported
 * "The user account could not be set up." The classification below is the fix.
 */

describe("classifyAuthUserError", () => {
  it("treats 500 'Database error loading user' as unloadable, never as missing", () => {
    const body = JSON.stringify({ code: 500, error_code: "unexpected_failure", msg: "Database error loading user" });
    expect(classifyAuthUserError(500, body)).toBe("unloadable");
  });

  it("treats 404 'User not found' as missing", () => {
    const body = JSON.stringify({ code: 404, error_code: "user_not_found", msg: "User not found" });
    expect(classifyAuthUserError(404, body)).toBe("missing");
  });

  it("treats a 'User not found' body on a non-404 status as missing", () => {
    expect(classifyAuthUserError(400, '{"msg":"User not found"}')).toBe("missing");
  });

  it("classifies an unloadable user before checking for not-found", () => {
    expect(classifyAuthUserError(404, '{"msg":"Database error loading user"}')).toBe("unloadable");
  });

  it("does not classify unrelated failures as missing or unloadable", () => {
    expect(classifyAuthUserError(500, '{"msg":"Internal server error"}')).toBe("other");
    expect(classifyAuthUserError(429, '{"msg":"Too many requests"}')).toBe("other");
  });
});

const okResponse = () => ({ ok: true, status: 200, text: async () => "" }) as unknown as Response;
const errResponse = (status: number, msg: string) =>
  ({ ok: false, status, text: async () => JSON.stringify({ msg }) }) as unknown as Response;

describe("setAuthUserPassword", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const opts = { userId: "u-1", email: "s@tst.com", password: "TST12345678" };

  it("returns ok when the password update succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await setAuthUserPassword(opts);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/auth/v1/admin/users/u-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  it("creates the account only when Supabase genuinely says not found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(404, "User not found"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await setAuthUserPassword(opts);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/v1/admin/users");
    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(createBody.id).toBe("u-1");
    expect(createBody.email).toBe("s@tst.com");
  });

  it("does NOT re-create the account when it exists but cannot be loaded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500, "Database error loading user"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setAuthUserPassword(opts);

    expect(result).toEqual({ ok: false, reason: "unloadable" });
    // The regression: this used to make a second call that could never succeed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports create_failed when the fallback create is refused", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(404, "User not found"))
      .mockResolvedValueOnce(errResponse(500, "duplicate key value violates unique constraint"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await setAuthUserPassword(opts)).toEqual({ ok: false, reason: "create_failed" });
  });

  it("classifies any other auth failure as other", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500, "Internal server error"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await setAuthUserPassword(opts)).toEqual({ ok: false, reason: "other" });
  });

  it("does not attempt a create without an email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(404, "User not found"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await setAuthUserPassword({ ...opts, email: null })).toEqual({ ok: false, reason: "other" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("authResetErrorMessage", () => {
  it("gives every failure reason a distinct, non-empty message", () => {
    const messages = (["unloadable", "create_failed", "other"] as const).map(authResetErrorMessage);
    messages.forEach((m) => expect(m.length).toBeGreaterThan(0));
    expect(new Set(messages).size).toBe(messages.length);
  });
});
