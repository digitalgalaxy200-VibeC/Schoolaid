/**
 * Site themes — the palettes a school may choose, and the contrast rules that
 * keep them readable.
 *
 * WHY PALETTES AND NOT A COLOUR PICKER
 * ------------------------------------
 * A school cannot make its own site unreadable here, because it does not pick
 * colours: it picks one of these, and each one was checked before it shipped.
 * `src/lib/site/__tests__/theme.test.ts` computes the WCAG contrast ratio of
 * every pair the templates actually render and fails the build if a palette
 * drifts out of range — so "the platform owns the design" is enforced by a test
 * rather than by a note in a document.
 *
 * THE ACCENT IS DECORATIVE BY POLICY
 * ----------------------------------
 * The accent is used for rules and bars, never for text and never as the only
 * way to tell one thing from another, so it is only required to clear the
 * non-text threshold (3:1). That is deliberate: a brighter, friendlier amber
 * fails 4.5:1, and pretending otherwise would mean either a duller palette or a
 * false assertion.
 *
 * HOW THESE REACH THE PAGE
 * ------------------------
 * The resolver resolves a palette into plain colour values and the renderer
 * publishes them as CSS custom properties on the site's wrapper. Templates read
 * `var(--site-primary)` and friends, so a Tailwind v4 `@theme` block — which
 * inlines its values at build time and therefore cannot be themed per school —
 * is not involved at all.
 */

export type ThemeSlot = "primary" | "primaryDark" | "accent" | "tint" | "onPrimary";

export type SitePalette = {
  id: string;
  label: string;
  colors: Record<ThemeSlot, string>;
};

/**
 * The default is the first entry, and `resolvePalette` falls back to it for any
 * unknown id — a school's site must not go dark because its stored palette name
 * was removed from this list.
 */
export const SITE_PALETTES: readonly SitePalette[] = [
  {
    id: "cobalt",
    label: "Cobalt",
    colors: {
      primary: "#2A4B8D",
      primaryDark: "#1D3766",
      accent: "#A96A0A",
      tint: "#E8EEFA",
      onPrimary: "#FFFFFF",
    },
  },
  {
    id: "forest",
    label: "Forest",
    colors: {
      primary: "#1B5E3A",
      primaryDark: "#124229",
      accent: "#A96A0A",
      tint: "#E7F1EB",
      onPrimary: "#FFFFFF",
    },
  },
  {
    id: "plum",
    label: "Plum",
    colors: {
      primary: "#6B2E5F",
      primaryDark: "#4A2042",
      accent: "#A96A0A",
      tint: "#F2E9F0",
      onPrimary: "#FFFFFF",
    },
  },
  {
    id: "slate",
    label: "Slate",
    colors: {
      primary: "#334155",
      primaryDark: "#1E293B",
      accent: "#A96A0A",
      tint: "#E9EEF4",
      onPrimary: "#FFFFFF",
    },
  },
  {
    id: "maroon",
    label: "Maroon",
    colors: {
      primary: "#7A2F2F",
      primaryDark: "#572121",
      accent: "#A96A0A",
      tint: "#F4EAEA",
      onPrimary: "#FFFFFF",
    },
  },
] as const;

export const DEFAULT_PALETTE = SITE_PALETTES[0];

/** The palette behind an id, or the default when the id is unknown or absent. */
export function resolvePalette(id: unknown): SitePalette {
  if (typeof id === "string") {
    const found = SITE_PALETTES.find((palette) => palette.id === id);
    if (found) return found;
  }
  return DEFAULT_PALETTE;
}

/** Whether an id names a palette this platform ships (used by the write path). */
export function isKnownPalette(id: string): boolean {
  return SITE_PALETTES.some((palette) => palette.id === id);
}

/** The palette ids, for validating a write and for the picker in the CMS. */
export const PALETTE_IDS: readonly string[] = SITE_PALETTES.map((palette) => palette.id);

// ── Contrast ────────────────────────────────────────────────────────────────

/** `#RRGGBB` → the three channels. Throws on anything else: these are our values. */
function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a hex colour: ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1:1 … 21:1. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
