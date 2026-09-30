import { describe, it, expect } from "vitest";
import {
  DEFAULT_PALETTE,
  PALETTE_IDS,
  SITE_PALETTES,
  contrastRatio,
  isKnownPalette,
  resolvePalette,
} from "../theme";

/**
 * The palettes are the platform's promise that a school cannot make its own
 * site unreadable. These tests are that promise, computed rather than asserted
 * by eye: every pair the templates actually render is measured, and the build
 * fails if a palette drifts out of range.
 *
 * The accent is checked at the non-text threshold on purpose — it is used for
 * rules and bars, never for text and never as the only signal.
 */

const WHITE = "#FFFFFF";
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("contrastRatio", () => {
  it("spans 1:1 to 21:1", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio(WHITE, "#000000")).toBeCloseTo(21, 1);
  });

  it("does not care which colour is given first", () => {
    expect(contrastRatio("#2A4B8D", WHITE)).toBeCloseTo(contrastRatio(WHITE, "#2A4B8D"), 5);
  });

  it("refuses something that is not a hex colour", () => {
    expect(() => contrastRatio("rebeccapurple", WHITE)).toThrow();
  });
});

describe("the palette list", () => {
  it("ships more than one choice, with unique ids", () => {
    expect(SITE_PALETTES.length).toBeGreaterThan(1);
    expect(new Set(PALETTE_IDS).size).toBe(SITE_PALETTES.length);
  });

  it("declares all five slots, each a six-digit hex colour", () => {
    for (const palette of SITE_PALETTES) {
      for (const [slot, value] of Object.entries(palette.colors)) {
        expect(`${palette.id}.${slot} ${value}`).toMatch(/^[a-z0-9.]+ #[0-9A-F]{6}$/i);
      }
    }
  });
});

describe("resolvePalette", () => {
  it("returns the named palette", () => {
    expect(resolvePalette("plum").id).toBe("plum");
  });

  it("falls back to the default for an unknown, absent or wrong-typed id", () => {
    // A live school's site must never go dark because a palette was retired.
    expect(resolvePalette("does-not-exist").id).toBe(DEFAULT_PALETTE.id);
    expect(resolvePalette(undefined).id).toBe(DEFAULT_PALETTE.id);
    expect(resolvePalette(null).id).toBe(DEFAULT_PALETTE.id);
    expect(resolvePalette(42).id).toBe(DEFAULT_PALETTE.id);
    expect(resolvePalette({ id: "plum" }).id).toBe(DEFAULT_PALETTE.id);
  });
});

describe("isKnownPalette", () => {
  it("accepts what is shipped and nothing else", () => {
    for (const id of PALETTE_IDS) expect(isKnownPalette(id)).toBe(true);
    expect(isKnownPalette("constructor")).toBe(false);
    expect(isKnownPalette("toString")).toBe(false);
    expect(isKnownPalette("")).toBe(false);
  });
});

describe("every palette, every pair the templates render", () => {
  it("keeps text legible on the branded bar and on white", () => {
    for (const palette of SITE_PALETTES) {
      const { primary, primaryDark, onPrimary, tint } = palette.colors;

      expect
        .soft(contrastRatio(onPrimary, primary), `${palette.id}: white on primary`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect
        .soft(contrastRatio(onPrimary, primaryDark), `${palette.id}: white on primaryDark`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect
        .soft(contrastRatio(primary, WHITE), `${palette.id}: primary as a link on white`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect
        .soft(contrastRatio(primaryDark, WHITE), `${palette.id}: heading on white`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect
        .soft(contrastRatio(primaryDark, tint), `${palette.id}: heading on the tinted band`)
        .toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps the accent visible against white as a graphic (3:1, not 4.5:1)", () => {
    for (const palette of SITE_PALETTES) {
      expect
        .soft(contrastRatio(palette.colors.accent, WHITE), `${palette.id}: accent rule on white`)
        .toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});
