import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

/**
 * The headers are policy, and policy is worth a test precisely because a
 * future edit to next.config.ts can drop one with no page changing appearance.
 */
describe("security headers", () => {
  it("sends the platform's safety headers on every path", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();

    const rule = rules!.find((entry) => entry.source === "/(.*)");
    expect(rule).toBeDefined();

    const sent = Object.fromEntries(rule!.headers.map((header) => [header.key, header.value]));
    expect(sent["X-Content-Type-Options"]).toBe("nosniff");
    expect(sent["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(sent["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
    expect(sent["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(sent["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });
});
