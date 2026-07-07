// ============================================================================
// SchoolAid — Design Token System (Ticket 1.7)
// Single source of truth for every visual value in the platform.
// RULE: Never hardcode a color, font, spacing, radius, or shadow value.
//        Always reference or add a token here.
// ============================================================================

// ─── Color Palette ──────────────────────────────────────────────────────────
export const color = {
  // Brand
  primary: "#2563EB", // Blue-600 — buttons, headers, links
  secondary: "#7C3AED", // Violet-600 — secondary actions, accents
  tertiary: "#0891B2", // Cyan-600 — tertiary highlights

  // Backgrounds
  background: "#FFFFFF",
  surface: "#F8FAFC", // Slate-50 — card/panel backgrounds
  surfaceHover: "#F1F5F9", // Slate-100

  // Text
  textPrimary: "#0F172A", // Slate-900
  textSecondary: "#475569", // Slate-600
  textMuted: "#94A3B8", // Slate-400
  textInverse: "#FFFFFF",

  // Borders
  border: "#E2E8F0", // Slate-200
  borderLight: "#F1F5F9", // Slate-100
  borderFocus: "#2563EB", // Blue-600

  // Semantic
  success: "#16A34A", // Green-600
  error: "#DC2626", // Red-600
  warning: "#D97706", // Amber-600
  info: "#2563EB", // Blue-600

  // Role-specific accents
  roleSuperAdmin: "#7C3AED", // Violet
  roleSchoolAdmin: "#2563EB", // Blue
  roleTeacher: "#0891B2", // Cyan
  roleStudent: "#16A34A", // Green

  // Status
  statusActive: "#16A34A",
  statusInactive: "#94A3B8",
  statusDraft: "#D97706",
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────
export const font = {
  family: {
    sans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
  size: {
    heading1: "2rem", // 32px
    heading2: "1.5rem", // 24px
    heading3: "1.25rem", // 20px
    heading4: "1.125rem", // 18px
    body: "1rem", // 16px — base
    bodySmall: "0.875rem", // 14px
    caption: "0.75rem", // 12px
    tiny: "0.625rem", // 10px
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ─── Spacing Scale ──────────────────────────────────────────────────────────
// Step scale: 4 → 8 → 12 → 16 → 20 → 24 → 32 → 40 → 48 → 64
export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "0.75rem", // 12px
  lg: "1rem", // 16px
  xl: "1.5rem", // 24px
  "2xl": "2rem", // 32px
  "3xl": "2.5rem", // 40px
  "4xl": "3rem", // 48px
  "5xl": "4rem", // 64px
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const radius = {
  none: "0",
  sm: "0.25rem", // 4px
  md: "0.5rem", // 8px
  lg: "0.75rem", // 12px
  xl: "1rem", // 16px
  full: "9999px",
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────
export const shadow = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
} as const;

// ─── Breakpoints (Ticket 1.9 — Mobile-First) ────────────────────────────────
export const breakpoint = {
  mobile: "0px", // default — mobile-first
  tablet: "768px",
  desktop: "1024px",
  wide: "1280px",
} as const;
