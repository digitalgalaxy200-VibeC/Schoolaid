import { describe, it, expect } from "vitest";
import {
  clientIp,
  evaluateRateLimit,
  tooManyAttemptsResponse,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "../rate-limit";
import { MEDIA_RATE_LIMIT, mediaRateKey } from "../site/media";

/**
 * The throttles are shared by login, the website editor and media uploads, so a
 * mistake here is either a lockout (too strict) or no protection at all (too
 * loose). These tests cover the decisions that need no database: how a client is
 * identified, and when a stored counter means "blocked".
 */

describe("clientIp", () => {
  const request = (headers: Record<string, string>) =>
    new Request("https://example.test/api", { headers });

  it("takes the first address from a forwarded chain", () => {
    // Behind another proxy the header is "client, proxy1, proxy2". Using the
    // whole string as the key would split one client across buckets.
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" }))).toBe(
      "203.0.113.9",
    );
  });

  it("trims whitespace around the address", () => {
    expect(clientIp(request({ "x-forwarded-for": "  203.0.113.9  " }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when there is no forwarded header", () => {
    expect(clientIp(request({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("never returns an empty string, so the key is always usable", () => {
    expect(clientIp(request({}))).toBe("unknown");
    expect(clientIp(request({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});

describe("evaluateRateLimit", () => {
  const now = Date.parse("2026-10-23T09:00:00.000Z");
  const inSeconds = (s: number) => new Date(now + s * 1000).toISOString();

  it("allows a caller with no row — they have not tried yet", () => {
    expect(evaluateRateLimit(null, 5, now)).toEqual({ blocked: false, retryAfterSeconds: 0 });
  });

  it("allows a caller under the limit", () => {
    expect(evaluateRateLimit({ attempts: 4, expires_at: inSeconds(30) }, 5, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
  });

  it("blocks a caller at the limit and reports the remaining wait", () => {
    expect(evaluateRateLimit({ attempts: 5, expires_at: inSeconds(30) }, 5, now)).toEqual({
      blocked: true,
      retryAfterSeconds: 30,
    });
  });

  it("rounds a partial second up, so the client never retries too early", () => {
    const expiresAt = new Date(now + 1500).toISOString();
    expect(evaluateRateLimit({ attempts: 9, expires_at: expiresAt }, 5, now)).toEqual({
      blocked: true,
      retryAfterSeconds: 2,
    });
  });

  it("never reports a wait of zero seconds while still blocked", () => {
    const expiresAt = new Date(now + 10).toISOString();
    expect(evaluateRateLimit({ attempts: 9, expires_at: expiresAt }, 5, now).retryAfterSeconds).toBe(1);
  });

  it("forgets a window that has ended", () => {
    expect(evaluateRateLimit({ attempts: 5, expires_at: inSeconds(0) }, 5, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
    expect(evaluateRateLimit({ attempts: 5, expires_at: inSeconds(-60) }, 5, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
  });

  it("treats an unreadable expiry as expired rather than as a permanent block", () => {
    expect(evaluateRateLimit({ attempts: 99, expires_at: "not a date" }, 5, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
    expect(evaluateRateLimit({ attempts: 99, expires_at: null }, 5, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
  });

  it("reads counters that arrive as strings, as Postgres can send them", () => {
    expect(evaluateRateLimit({ attempts: "5", expires_at: inSeconds(12) }, 5, now)).toEqual({
      blocked: true,
      retryAfterSeconds: 12,
    });
  });

  it("lets the sixth typo through and blocks the seventh", () => {
    // Login uses a limit of 7: six wrong passwords must not lock anyone out,
    // because a real person mistypes more than a few times.
    expect(evaluateRateLimit({ attempts: 6, expires_at: inSeconds(30) }, 7, now)).toEqual({
      blocked: false,
      retryAfterSeconds: 0,
    });
    expect(evaluateRateLimit({ attempts: 7, expires_at: inSeconds(30) }, 7, now)).toEqual({
      blocked: true,
      retryAfterSeconds: 30,
    });
  });
});

describe("tooManyAttemptsResponse", () => {
  it("says how long to wait, in plain words", async () => {
    const res = tooManyAttemptsResponse(45);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");

    const body = await res.json();
    expect(body.retry_after_seconds).toBe(45);
    expect(body.error).toContain("Too many attempts");
    expect(body.error).toContain("45 seconds");
  });

  it("never reports a wait under one second, and uses the singular", async () => {
    const body = await tooManyAttemptsResponse(0).json();
    expect(body.retry_after_seconds).toBe(1);
    expect(body.error).toContain("1 second");
  });

  it("rounds a partial second up so the client does not retry too early", async () => {
    const body = await tooManyAttemptsResponse(4.2).json();
    expect(body.retry_after_seconds).toBe(5);
  });
});

describe("mediaRateKey", () => {
  it("scopes the bucket to one person inside one school", () => {
    expect(mediaRateKey("school-1", "user-1")).toBe("website-media:school-1:user-1");
    // Two administrators of the same school must not share a bucket: one bulk
    // upload used to lock the other out.
    expect(mediaRateKey("school-1", "user-1")).not.toBe(mediaRateKey("school-1", "user-2"));
  });

  it("still produces a usable key when the session carries no user id", () => {
    expect(mediaRateKey("school-1", null)).toBe("website-media:school-1:unknown");
  });

  it("allows more than one realistic bulk batch per minute", () => {
    // A 60-image gallery upload is legitimate; the ceiling must not be below it.
    expect(MEDIA_RATE_LIMIT.max).toBeGreaterThanOrEqual(60);
    expect(MEDIA_RATE_LIMIT.windowMs).toBe(DEFAULT_RATE_LIMIT_WINDOW_MS);
  });
});
