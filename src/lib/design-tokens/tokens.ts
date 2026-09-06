// ============================================================================
// SchoolAid — Design Token System
// Single source of truth for every visual value in the platform.
//
// RULE: Never hardcode a color, font, spacing, radius, or shadow value.
//        Always reference or add a token here.
//
// NOTE: These JS tokens mirror the CSS @theme block in globals.css exactly.
//        Use CSS classes (Tailwind) for all presentational components.
//        Use these JS tokens ONLY for non-Tailwind contexts:
//          • Recharts / chart colors
//          • Inline `style` props
//          • Dynamic theme calculations
// ============================================================================

// ─── Color Palette ──────────────────────────────────────────────────────────
export const color = {
  // Brand — Cobalt palette (matches globals.css @theme exactly)
  primary:      "#2A4B8D", // Cobalt — primary actions, links, focus
  primaryDark:  "#1D3766",
  primaryLight: "#E8EEFA",
  accent:       "#F0A63A", // Sunrise amber — highlights, secondary CTAs
  accentDark:   "#C9821C",

  // Semantic
  success:   "#1D9A5B",
  successBg: "#E6F6ED",
  error:     "#D64545",
  errorBg:   "#FCEAEA",
  warning:   "#C9821C",
  warningBg: "#FBF0DE",
  info:      "#2A4B8D",
  infoBg:    "#E8EEFA",

  // Neutrals
  background:    "#F5F6F8",
  surface:       "#FFFFFF",
  clay:          "#EEF2F7",
  border:        "#E2E5EA",
  borderStrong:  "#C9CFD8",
  textPrimary:   "#16202E",
  textSecondary: "#4B5666",
  textMuted:     "#8891A0",
  textInverse:   "#FFFFFF",

  // Role accents
  roleSuperAdmin:  "#2A4B8D",
  roleSchoolAdmin: "#2A4B8D",
  roleTeacher:     "#F0A63A",
  roleStudent:     "#1D9A5B",

  // Status
  statusActive:   "#1D9A5B",
  statusInactive: "#8891A0",
  statusDraft:    "#C9821C",
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const font = {
  family: {
    // Inter only — loaded via next/font/google in layout.tsx for optimal perf.
    // No Sora. Keeping a single font family reduces network overhead and
    // eliminates flash-of-unstyled-text (FOUT) on mobile devices.
    display: "'Inter', ui-sans-serif, system-ui, sans-serif",
    sans:    "'Inter', ui-sans-serif, system-ui, sans-serif",
    mono:    "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  },
  size: {
    display: "36px",  // --font-size-display
    h1:      "30px",  // --font-size-h1
    h2:      "24px",  // --font-size-h2
    h3:      "20px",
    body:    "16px",  // --font-size-body
    small:   "14px",  // --font-size-caption
    caption: "12px",
    mono:    "13px",
  },
  weight: {
    regular:   400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },
  lineHeight: {
    tight:  1.25,
    normal: 1.55,
  },
} as const;

// ─── Spacing Scale (4px base) ──────────────────────────────────────────────
export const spacing = {
  "1": "4px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "24px",
  "6": "32px",
  "7": "48px",
  "8": "64px",
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const radius = {
  sm:   "6px",
  md:   "10px",
  lg:   "16px",
  xl:   "20px",
  full: "9999px",
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────
// Ink-based rgba for crisp shadows on white/light surfaces
export const shadow = {
  sm: "0 1px 2px rgba(22, 32, 46, 0.06)",
  md: "0 4px 14px rgba(22, 32, 46, 0.08)",
  lg: "0 12px 32px rgba(22, 32, 46, 0.12)",
} as const;

// ─── Breakpoints ────────────────────────────────────────────────────────────
export const breakpoint = {
  mobile:  "0px",
  tablet:  "768px",   // --breakpoint-tablet
  desktop: "1280px",  // --breakpoint-desktop
} as const;

// ─── Transitions ────────────────────────────────────────────────────────────
export const transition = {
  fast:   "150ms ease-out",
  normal: "220ms ease-out",
} as const;
