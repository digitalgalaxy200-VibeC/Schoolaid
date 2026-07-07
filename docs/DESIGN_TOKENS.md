# SchoolAid — Design Token Reference

## The Golden Rule

> **Never hardcode a color, font, spacing, radius, or shadow value.**
> Always reference a token from the design system or add a new one to the token file.

---

## Where Tokens Live

| Layer | File | Purpose |
|---|---|---|
| TypeScript constants | `src/lib/design-tokens/tokens.ts` | JS/TS imports |
| CSS custom properties | `src/app/globals.css` → `@theme inline` block | Tailwind utility classes |
| Tailwind classes | `bg-brand-primary` / `text-text-primary` | Used in all components |

---

## Usage

### In TSX (via Tailwind classes — preferred)

```tsx
<button className="bg-brand-primary text-text-inverse rounded-radius-md px-spacing-lg py-spacing-sm">
  Click me
</button>
```

### In JS/TS (via token imports)

```ts
import { color, spacing, font } from "@/lib/design-tokens/tokens";

console.log(color.primary);   // "#2563EB"
console.log(spacing.lg);      // "1rem"
```

---

## All Available Tokens

### Colors

| Token | Tailwind Class | Default Value |
|---|---|---|
| `color.primary` | `bg-brand-primary` / `text-brand-primary` | `#2563EB` |
| `color.secondary` | `bg-brand-secondary` | `#7C3AED` |
| `color.tertiary` | `bg-brand-tertiary` | `#0891B2` |
| `color.background` | `bg-bg-base` | `#FFFFFF` |
| `color.surface` | `bg-bg-surface` | `#F8FAFC` |
| `color.surfaceHover` | `bg-bg-surface-hover` | `#F1F5F9` |
| `color.textPrimary` | `text-text-primary` | `#0F172A` |
| `color.textSecondary` | `text-text-secondary` | `#475569` |
| `color.textMuted` | `text-text-muted` | `#94A3B8` |
| `color.textInverse` | `text-text-inverse` | `#FFFFFF` |
| `color.border` | `border-border-default` | `#E2E8F0` |
| `color.borderLight` | `border-border-light` | `#F1F5F9` |
| `color.borderFocus` | `ring-border-focus` | `#2563EB` |
| `color.success` | `bg-success` / `text-success` | `#16A34A` |
| `color.error` | `bg-error` / `text-error` | `#DC2626` |
| `color.warning` | `bg-warning` / `text-warning` | `#D97706` |
| `color.info` | `bg-info` / `text-info` | `#2563EB` |

### Typography

| Token | Tailwind Class | Value |
|---|---|---|
| `font.family.sans` | `font-sans` | `'Inter', ui-sans-serif, ...` |
| `font.family.mono` | `font-mono` | `'JetBrains Mono', ...` |
| `font.size.heading1` | `text-heading1` | `2rem` |
| `font.size.heading2` | `text-heading2` | `1.5rem` |
| `font.size.heading3` | `text-heading3` | `1.25rem` |
| `font.size.heading4` | `text-heading4` | `1.125rem` |
| `font.size.body` | `text-body` | `1rem` |
| `font.size.bodySmall` | `text-body-sm` | `0.875rem` |
| `font.size.caption` | `text-caption` | `0.75rem` |
| `font.size.tiny` | `text-tiny` | `0.625rem` |

### Spacing Scale

| Token | Tailwind Class | Value |
|---|---|---|
| `spacing.xs` | `p-xs` / `m-xs` / `gap-xs` | `0.25rem` (4px) |
| `spacing.sm` | `p-sm` / `m-sm` / `gap-sm` | `0.5rem` (8px) |
| `spacing.md` | `p-md` / `m-md` / `gap-md` | `0.75rem` (12px) |
| `spacing.lg` | `p-lg` / `m-lg` / `gap-lg` | `1rem` (16px) |
| `spacing.xl` | `p-xl` / `m-xl` / `gap-xl` | `1.5rem` (24px) |
| `spacing.2xl` | `p-2xl` / `m-2xl` / `gap-2xl` | `2rem` (32px) |
| `spacing.3xl` | `p-3xl` | `2.5rem` (40px) |
| `spacing.4xl` | `p-4xl` | `3rem` (48px) |
| `spacing.5xl` | `p-5xl` | `4rem` (64px) |

### Border Radius

| Token | Tailwind Class | Value |
|---|---|---|
| `radius.sm` | `rounded-radius-sm` | `0.25rem` |
| `radius.md` | `rounded-radius-md` | `0.5rem` |
| `radius.lg` | `rounded-radius-lg` | `0.75rem` |
| `radius.xl` | `rounded-radius-xl` | `1rem` |
| `radius.full` | `rounded-radius-full` | `9999px` |

### Shadows

| Token | Tailwind Class |
|---|---|
| `shadow.sm` | `shadow-sm` |
| `shadow.md` | `shadow-md` |
| `shadow.lg` | `shadow-lg` |
| `shadow.xl` | `shadow-xl` |

### Breakpoints (Mobile-First)

| Name | Min Width | Tailwind Prefix |
|---|---|---|
| mobile | `0px` (default) | *(none)* |
| tablet | `768px` | `tablet:` |
| desktop | `1024px` | `desktop:` |
| wide | `1280px` | `wide:` |

---

## When You Need a New Token

1. Add it to `src/lib/design-tokens/tokens.ts`
2. Add the corresponding CSS variable in `src/app/globals.css` inside the `@theme inline` block
3. Update this doc
4. Reference it everywhere — never hardcode the raw value

## Shared Component Library

All reusable components live in `src/components/ui/` and only reference tokens:

| Component | File | Props |
|---|---|---|
| `Button` | `src/components/ui/Button.tsx` | `variant` (`primary`, `secondary`, `danger`, `ghost`, `outline`), `size`, `loading`, `icon`, `fullWidth` |
| `Input` | `src/components/ui/Input.tsx` | `label`, `error`, `hint`, `icon`, `fullWidth`, standard HTML input props |
| `Card` | `src/components/ui/Card.tsx` | `padding`, `variant` (`default`, `surface`, `bordered`), `header`, `footer` |
| `Badge` | `src/components/ui/Badge.tsx` | `variant` (`default`, `success`, `warning`, `error`, `info`, `draft`) |
| `Table` | `src/components/ui/Table.tsx` | `columns`, `data`, `loading`, `emptyMessage` |
| `Modal` | `src/components/ui/Modal.tsx` | `isOpen`, `onClose`, `title`, `footer`, `size` |
| `Container` | `src/components/ui/Container.tsx` | Responsive layout wrapper |
| `Grid` | `src/components/ui/Container.tsx` | Responsive grid with breakpoint-aware columns |
