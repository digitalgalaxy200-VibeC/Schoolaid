import { describe, it, expect } from "vitest";
import {
  deepEqual,
  verifyWebsiteConfig,
  verifyWebsiteSection,
} from "../website-verify";

/** P2 follow-up — read-after-write verification for the website writes. */

describe("deepEqual", () => {
  it("ignores object key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
  it("distinguishes different values and shapes", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe("verifyWebsiteConfig", () => {
  it("verifies when the stored configuration matches what was reported", () => {
    const stored = { palette: { primary: "#111" }, contact: { whatsapp: "x" }, seo: { title: "t" } };
    expect(verifyWebsiteConfig(stored, stored)).toEqual({ verified: true, mismatches: [] });
  });

  it("names the fields that did not match", () => {
    const stored = { palette: { primary: "#111" }, contact: {}, seo: {} };
    const claimed = { palette: { primary: "#222" }, contact: {}, seo: {} };
    const verdict = verifyWebsiteConfig(stored, claimed);
    expect(verdict.verified).toBe(false);
    expect(verdict.mismatches).toContain("palette");
  });

  it("only compares the fields the handler claims", () => {
    // The handler reports palette only; contact/seo are not asserted.
    expect(verifyWebsiteConfig({ palette: { p: 1 } }, { palette: { p: 1 } })).toEqual({
      verified: true,
      mismatches: [],
    });
  });
});

describe("verifyWebsiteSection", () => {
  it("fails when the block was not found", () => {
    expect(verifyWebsiteSection(null, {})).toEqual({
      verified: false,
      mismatches: ["block not found"],
    });
  });

  it("verifies visibility and the sent fields", () => {
    const stored = { kind: "hero", is_visible: true, headline: "Welcome" };
    const verdict = verifyWebsiteSection(stored, {
      is_visible: true,
      fields: { headline: "Welcome" },
    });
    expect(verdict).toEqual({ verified: true, mismatches: [] });
  });

  it("flags a visibility mismatch and a changed field", () => {
    const stored = { kind: "hero", is_visible: false, headline: "Changed" };
    const verdict = verifyWebsiteSection(stored, {
      is_visible: true,
      fields: { headline: "Welcome" },
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.mismatches).toEqual(["is_visible", "headline"]);
  });
});
