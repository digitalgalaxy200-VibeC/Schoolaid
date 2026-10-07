import { describe, it, expect } from "vitest";
import { isPlatformHost, normaliseHost, PLATFORM_HOSTS } from "../hosts";

/**
 * The platform-host list decides, on every request, whether a host is ours or a
 * school's. It has been wrong in production once already — `schoolaid.online`
 * itself was missing, so our own domain was treated as a school's custom domain.
 */

describe("normaliseHost", () => {
  it("drops the port and lowercases", () => {
    expect(normaliseHost("Localhost:3000")).toBe("localhost");
    expect(normaliseHost("SCHOOLAID.ONLINE")).toBe("schoolaid.online");
  });

  it("survives a missing header", () => {
    expect(normaliseHost(null)).toBe("");
    expect(normaliseHost(undefined)).toBe("");
  });
});

describe("isPlatformHost", () => {
  it("owns every domain the platform actually runs on", () => {
    for (const host of ["localhost", "127.0.0.1", "schoolaid.online", "schoolaid.app"]) {
      expect(isPlatformHost(host), host).toBe(true);
    }
  });

  it("owns its own subdomains", () => {
    expect(isPlatformHost("www.schoolaid.online")).toBe(true);
    expect(isPlatformHost("staging.schoolaid.online")).toBe(true);
    expect(isPlatformHost("anything.schoolaid.app")).toBe(true);
    expect(isPlatformHost("schoolaid-git-main-x.vercel.app")).toBe(true);
  });

  it("does NOT own a school subdomain of the production domain", () => {
    // Subdomains are where schools live: `<school>.schoolaid.online` must resolve
    // to that school's website, not to the platform. A blanket `.schoolaid.online`
    // suffix would make every one of them a platform address — and the first
    // school to get one would silently see the platform instead of its own site.
    expect(isPlatformHost("gsapex.schoolaid.online")).toBe(false);
    expect(isPlatformHost("test.schoolaid.online")).toBe(false);
    expect(isPlatformHost("kings-college.schoolaid.online")).toBe(false);
  });

  it("does not own a school's domain", () => {
    for (const host of ["kingscollege.edu.ng", "gsapexstars.com", "school.example.org"]) {
      expect(isPlatformHost(host), host).toBe(false);
    }
  });

  it("is not fooled by a lookalike", () => {
    // The suffix check needs its leading dot, or these would pass.
    expect(isPlatformHost("notschoolaid.online")).toBe(false);
    expect(isPlatformHost("schoolaid.online.evil.com")).toBe(false);
    expect(isPlatformHost("schoolaid.app.evil.com")).toBe(false);
    expect(isPlatformHost("vercel.app.evil.com")).toBe(false);
  });

  it("treats a missing host as ours, not as a school's", () => {
    // With nothing to go on, the safe direction is the platform's own login.
    expect(isPlatformHost("")).toBe(true);
  });

  it("keeps the production domain in the list, not only in a suffix", () => {
    // Guards the specific regression: production going missing from the list.
    expect(PLATFORM_HOSTS).toContain("schoolaid.online");
  });
});
