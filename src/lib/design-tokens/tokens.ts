// ============================================================================
// SchoolAid — Design Token System
// Single source of truth for every visual value in the platform.
// RULE: Never hardcode a color, font, spacing, radius, or shadow value.
//        Always reference or add a token here.
// ============================================================================

// ─── Color Palette ──────────────────────────────────────────────────────────
export const color = {
  // Brand
  primary: "#2A4B8D", // Cobalt — primary actions, links, focus
  primaryDark: "#1D3766",
  primaryLight: "#E8EEFA",
  accent: "#F0A63A", // Sunrise amber — highlights, secondary CTAs
  accentDark: "#C9821C",

  // Semantic
  success: "#1D9A5B",
  successBg: "#E6F6ED",
  error: "#D64545",
  errorBg: "#FCEAEA",
  warning: "#C9821C",
  warningBg: "#FBF0DE",
  info: "#2A4B8D",
  infoBg: "#E8EEFA",

  // Neutrals
  background: "#F5F6F8",
  surface: "#FFFFFF",
  border: "#E2E5EA",
  borderStrong: "#C9CFD8",
  textPrimary: "#16202E",
  textSecondary: "#4B5666",
  textMuted: "#8891A0",
  textInverse: "#FFFFFF",

  // Role accents
  roleSuperAdmin: "#2A4B8D",
  roleSchoolAdmin: "#2A4B8D",
  roleTeacher: "#F0A63A",
  roleStudent: "#1D9A5B",

  // Status
  statusActive: "#1D9A5B",
  statusInactive: "#8891A0",
  statusDraft: "#C9821C",
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const font = {
  family: {
    display: "'Sora', ui-sans-serif, system-ui, sans-serif",
    sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  },
  size: {
    display: "34px",
    h1: "26px",
    h2: "21px",
    h3: "17px",
    body: "15px",
    small: "13px",
    caption: "11px",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
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
  sm: "6px",
  md: "10px",
  lg: "16px",
  full: "9999px",
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────
export const shadow = {
  sm: "0 1px 2px rgba(22, 32, 46, 0.06)",
  md: "0 4px 14px rgba(22, 32, 46, 0.08)",
  lg: "0 12px 32px rgba(22, 32, 46, 0.12)",
} as const;

// ─── Breakpoints ────────────────────────────────────────────────────────────
export const breakpoint = {
  mobile: "0px",
  tablet: "768px",
  desktop: "1120px",
} as const;
