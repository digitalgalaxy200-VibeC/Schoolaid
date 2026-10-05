---
name: Institutional Modernity
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0daee'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff3ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dfe9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#444650'
  inverse-surface: '#273140'
  inverse-on-surface: '#ebf1ff'
  outline: '#747781'
  outline-variant: '#c4c6d2'
  surface-tint: '#3d5c9f'
  primary: '#0a3375'
  on-primary: '#ffffff'
  primary-container: '#2a4b8d'
  on-primary-container: '#a3beff'
  inverse-primary: '#b0c6ff'
  secondary: '#845400'
  on-secondary: '#ffffff'
  secondary-container: '#feb245'
  on-secondary-container: '#6f4600'
  tertiary: '#552c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#763f00'
  on-tertiary-container: '#fbad69'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#b0c6ff'
  on-primary-fixed: '#001944'
  on-primary-fixed-variant: '#224486'
  secondary-fixed: '#ffddb6'
  secondary-fixed-dim: '#ffb95a'
  on-secondary-fixed: '#2a1800'
  on-secondary-fixed-variant: '#643f00'
  tertiary-fixed: '#ffdcc2'
  tertiary-fixed-dim: '#ffb77b'
  on-tertiary-fixed: '#2e1500'
  on-tertiary-fixed-variant: '#6d3a00'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
  tabular-num:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system is engineered for multi-tenant educational administration across West Africa, balancing structural institutional credibility with an optimistic, accessible warmth. The visual identity addresses the demanding operational reality of primary, secondary, and tertiary school networks—where administrators, teachers, bursars, and parents interface daily across varying device tiers, unstable connectivity, and distinct administrative workflows.

The design movement is **Modern Institutionalism**: a clean, highly structured, legible foundation that foregoes fragile decorative motifs in favor of durable layouts, assertive visual hierarchy, and tactile clarity. It borrows the disciplined order of enterprise utility and softens it with warm, sunrise-tinted accents to evoke growth, encouragement, and civic dignity.

The emotional signature must communicate:
- **Absolute Reliability & Fiduciary Trust:** Bursary receipts, WAEC/BECE grade entries, and multi-branch ledgers must look authoritative, immutably recorded, and error-resistant.
- **Clarity under Pressure:** High visual distinction prevents data-entry fatigue during peak examination marking or termly fee reconciliation.
- **Warmth & Inclusivity:** Welcoming touchpoints for parents accessing student performance portals on mobile devices over fluctuating 3G/4G connections.

## Colors

The palette grounds high-stakes administrative tasks in sovereign cobalt blues, balanced by an energizing amber that highlights critical student milestones and urgent calls to action.

### Palette Architecture
- **Primary (Cobalt Blue - `#2A4B8D`):** The institutional anchor. Used for primary navigation bars, dominant action buttons, table header borders, and verified school identity markers.
  - *Deep Cobalt (`#1D3766`):* Active/pressed states, high-priority system headers, and sidebar anchors.
  - *Light Cobalt Tint (`#E8EEFA`):* Selected table row backgrounds, active menu item containers, and informational alert fills.
- **Secondary (Sunrise Amber - `#F0A63A`):** The dynamic focal accent. Reserved for pending fee indicators, CBT exam timers, outstanding balances, and key operational notices.
  - *Dark Amber (`#C9821C`):* Text labels and icon fills on amber containers to guarantee WCAG AAA compliance.
  - *Light Amber Tint (`#FEF6EB`):* Background fills for warnings, provisional grade tags, and invoice reminders.
- **Neutral & Typography Tones:**
  - *Base Charcoal (`#16202E`):* Primary ink for text, icons, and critical numerical data. Ensures maximum readability without the harshness of pure black.
  - *Muted Slate (`#5B6B82`):* Secondary metadata, table subtitles, breadcrumb paths, and form helper text.
  - *Dividers & Borders (`#E2E8F0`):* Structural lines, input contours, and card frames.
- **Surfaces:**
  - *Base Surface (`#FFFFFF`):* Default card background, modal canvas, and report card sheets.
  - *Surface Alternate (`#F8FAFC`):* Global canvas underlay, alternating list stripes, and disabled container backgrounds.

### Functional Status System
- **Success (`#15803D`, tint `#ECFDF5`):** Paid fees, approved results, passed scores.
- **Destructive (`#DC2626`, tint `#FEF2F2`):** Expulsion flags, critical financial deficits, exam termination warnings.

## Typography

The typography leverages **Plus Jakarta Sans** across all roles to project modern structure while maintaining warm human geometry. 

### Sizing and Legibility Rules
- **18px Standard Body Copy:** The base narrative copy is set to 18px (`body-lg`) across parent communications, examination guides, and official administrative notes to provide effortless legibility on low-dpi displays and mobile screens outdoors.
- **Tabular Numerics:** For fee ledgers, CBT question counters, and terminal grading transcripts, enforce `font-feature-settings: "tnum" 1` to ensure strict vertical column alignment across thousands of currency figures and percentages.
- **Letter Spacing:** All small labels and badges (`label-sm`) require tracking of `+0.025em` to prevent visual clogging when rendered in uppercase.

## Layout & Spacing

The layout is built upon an 8-point baseline rhythm designed to handle dense data matrices without visual tension.

### Canvas Adaptation Rules
- **Desktop (1200px+):** 12-column responsive fluid grid with 24px (`1.5rem`) gutters and 32px (`2rem`) outer margins. Supports persistent left-hand navigation (280px fixed) and deep administrative layouts (3-column splits for student rosters, detail panels, and quick actions).
- **Tablet (768px – 1199px):** 8-column layout with 16px gutters and 24px margins. Navigation collapses to an off-canvas drawer. Student rosters drop secondary metadata columns (e.g., blood group, state of origin) while keeping core admission identifiers.
- **Mobile (<768px):** 4-column layout with 16px gutters and 16px margins. Full-width stacked components. Critical navigation converts into a bottom bar or stacked app-shell actions.

### Spacing Philosophy
Internal padding within operational containers (report cards, receipt cards, CBT interfaces) must remain generous to eliminate tapping errors on touchscreen devices. Minimum gap between interactive elements is 12px.

## Elevation & Depth

This system avoids heavy, theatrical drop shadows. Visual depth is established primarily through **tactile border-anchoring supplemented by ultra-soft, low-diffusion ambient shadows**.

### Elevation Scales
- **Level 0 (Flat / Canvas):** Applied to the global application background (`#F8FAFC`). No shadow, no border.
- **Level 1 (Card & Row Base):** Background `#FFFFFF`, border `1px solid #E2E8F0`, shadow: `0px 1px 2px rgba(22, 32, 46, 0.05)`. Used for content widgets, grade book entries, student list cards, and table bodies.
- **Level 2 (Interactive Hover / Floating Actions):** Background `#FFFFFF`, border `1px solid #CBD5E1`, shadow: `0px 4px 12px rgba(22, 32, 46, 0.08)`. Used for hovered cards, active CBT question options, and dropdown menus.
- **Level 3 (Modals & Overlays):** Background `#FFFFFF`, border none, shadow: `0px 12px 32px rgba(22, 32, 46, 0.14)`. Used for fee payment modals, student promotion dialogues, and printable receipt previews.

## Shapes

The design uses balanced, modern geometric rounding to soften bureaucratic rigidity while maintaining structural poise:
- **Base Components (Inputs, Buttons, Dropdowns):** `8px` (`roundedness: 2`) curvature provides crisp corners with soft tactile edges.
- **Containers & Surfaces (Cards, Modals, Exam Panes):** `16px` (`rounded-xl`) outer boundary radius, creating defined panels that frame dense school data.
- **Status Indicators & Indicators:** Full pill (`9999px`) rounded geometry for badges, tags, and category chips to contrast against rectangular table rows and cards.

## Components

### Buttons & Interactive Targets
- **Sizing:** Strict minimum touch target of 48px height across mobile and desktop. Minimum interactive width of 48px.
- **Primary Button:** Background `#2A4B8D`, text `#FFFFFF`, border: none, border-radius 8px. Hover state: `#1D3766`. Focus state: 2px offset ring in `#F0A63A`.
- **Secondary Button:** Background `#FFFFFF`, text `#2A4B8D`, border: `1.5px solid #2A4B8D`. Hover: `#E8EEFA`.
- **Accent Button:** Background `#F0A63A`, text `#16202E` (high-contrast deep charcoal), border: none. Used solely for high-conversion triggers (e.g., "Pay School Fees", "Submit CBT Exam").

### Badges & Status Chips
- Pill-shaped (`rounded-full`), padding 4px 12px, font size 12px bold (`label-sm`).
- **Paid / Approved:** Background `#ECFDF5`, text `#15803D`.
- **Pending / In Review:** Background `#FEF6EB`, text `#C9821C`.
- **Arrears / Flagged:** Background `#FEF2F2`, text `#DC2626`.

### Form Inputs & Selectors
- Height 48px, background `#FFFFFF`, border `1.5px solid #E2E8F0`, padding 0 16px, font size 16px.
- Active/Focused: Border `#2A4B8D`, box-shadow `0 0 0 3px rgba(42, 75, 141, 0.15)`.
- Error state: Border `#DC2626`, box-shadow `0 0 0 3px rgba(220, 38, 38, 0.15)`.

### Checkboxes & Radio Buttons
- 24px × 24px bounding box to support swift tap interactions.
- Checkbox uses 6px radius; Radio uses full circular radius.
- Active Fill: `#2A4B8D` with white checkmark/dot.

### Cards & Specialized Educational Containers
- **Dashboard Metric Card:** White surface, 16px corner radius, 1px border (`#E2E8F0`), padding 24px. Features a bold metric value, muted trend subtitle, and contextual top-right pill badge.
- **Bursary Receipt View:** Modeled after official West African treasury slips: crisp dashed separation lines (`#E2E8F0`), high-contrast tabular breakdown with alternating `#F8FAFC` lines, bold total sum container in `#E8EEFA`, and a verified watermark seal.
- **Terminal Student Report Card:** Multi-tiered table component. Subject names pinned left, continuous test (CA1, CA2) scores centered, final exam score, term average, position indicator, and teacher remarks. Headers use dark cobalt `#1D3766` with pure white uppercase labels.
- **CBT (Computer-Based Test) Exam Pane:** High-focus modal container. Top bar features a fixed countdown clock rendered in Amber `#F0A63A`, large readable question prompt (20px font), and radio selectable cards with distinct 2px hover and selected states in `#2A4B8D`.