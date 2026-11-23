# Landing page — design direction

Written before the page was coded, and kept so the choices can be challenged
later. Applies the `frontend-design-direction` skill to
`src/app/page.tsx`.

## 1. Direction

**Purpose.** Turn a private-school owner from "we cope with paper" to "I want an
assessment" — in one scroll, on a phone, on a slow connection.

**Audience.** Proprietors, principals and school administrators in Nigeria (and
pilot schools in Benin / Francophone Africa). They scan on a phone between
meetings. They care, in order: *does this understand my school?* → *what actually
happens if I say yes?* → *what does it cost?* → *can we afford it?* → *is this
legitimate?*

**Tone.** Editorial and grounded — a prospectus, not a SaaS console. Warm paper,
serif headlines, one accent. Not playful, not "startup".

**Memorable detail.** The hero carries an actual artefact of the product: a
phone showing a marked report card (subject, score, grade, average). It is drawn
in CSS, so it loads with the document and can never 404. This is the one thing a
visitor should remember — *the thing we are buying is the thing on screen.*

**Constraints.** Next.js 16 App Router, one server component; Tailwind v4 with
the existing `lp-*` tokens; no new dependencies; no third-party font request (the
serif comes from the device stack, the sans is the already-vendored Plus Jakarta
Sans); mobile-first; WCAG AA.

## 2. Hierarchy and scan path

1. Headline + one-sentence product (H1).
2. Artefact: the report card.
3. Two actions, identical everywhere: **Apply** (primary) and **Book a call**.
4. Then proof of understanding (before/after), process, modules, economics,
   price, fit, trust, vision, application, contact.

Every section starts with a numbered/eyebrow label so a scanner can jump without
reading. Only one H1; sections are H2; tiles are H3.

## 3. Content states

| State | Where | What the visitor sees |
| --- | --- | --- |
| Loading | application form | Button reads "Sending…", disabled; layout does not shift. |
| Empty | proof section | Section is not rendered at all when no proof asset exists — no hollow tile. |
| Error | application form | Field-level messages + one live `role="alert"` line; focus moves to it. |
| Partial | calculator | If the parent fee does not cover SchoolAid's rate, the school's share shows negative and a specific correction is offered. |
| Success | application form | Confirmation panel replaces the form, `role="status"`. |
| Permission | — | Not applicable: the page is public and reads no account data. |

## 4. Anti-patterns this page avoids

- No purple gradients, blobs, or atmospheric stock imagery.
- No card inside a card: the form card contains a plain form; tiles are leaves.
- No bullet wall: the challenge is a before/after story, the process a timeline.
- No repeated go-live checklist: it appears once (pricing), referenced elsewhere.
- No icon-card carpet: modules are a bento with Results as the anchor tile.
- No dead buttons: every action has a real destination or a documented fallback.

## 5. Palette (multi-dimensional, not one hue)

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#faf6f0` | Warm paper background |
| Ink | `#0a3375` | Brand navy: headings, primary structure |
| Accent | `#feb245` | Actions only |
| Accent text | `#8a5a00` | Eyebrows on paper (AA on canvas) |
| Sage | `#eef5ee` / `#1d6b41` | The "after" story |
| Clay | `#f4eee4` | Alternating sections |
| Deep ink | `#121c2a` | Footer, phone bezel |

Text pairs were chosen to clear 4.5:1 at body sizes; the "illustrative" caption
and placeholder labels use `#6b6357` rather than a lighter grey for the same
reason.

## 6. Responsive contract

- One container: `max-w-6xl`, padding `20px` → `24px` → `32px`.
- Every grid is single-column below `768px` (the timeline becomes vertical, the
  bento stacks, the footer stacks).
- No table on the page: the revenue model is a calculator, the pricing is cards.
- Fixed-format controls keep their width (calculator number fields) so the row
  does not jump when a value changes.
- Sticky header `64px` / `80px`; sticky mobile action bar ≥48px targets, padded
  for `env(safe-area-inset-bottom)`.
- Target viewports: **360×640, 390×844, 768×1024, 1024×768, 1440×900**.

## 7. Rendered finish gate — NOT RUN

The skill requires screenshots at the target viewports, keyboard pass, visible
focus, contrast, reduced motion and touch-target checks on the rendered page.
**This environment has no browser**, so that gate is untested, not passed.

To complete it:

1. `npm run dev`, then capture `/` at 360×640, 390×844, 768×1024, 1024×768 and
   1440×900.
2. Check: zero horizontal scroll; no clipped text; sticky bar does not cover the
   footer; focus ring visible on every link, summary and input; FAQ opens by
   keyboard; form error and success states read correctly.
3. Write the evidence record and run:
   `node ~/.agents/skills/frontend-design-direction/scripts/check-evidence.js <record.json>`

Until then this page should be described as *implemented and source-reviewed*,
not as *visually verified*.
