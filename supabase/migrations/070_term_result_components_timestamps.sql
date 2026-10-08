-- ============================================================================
-- 070 — term_result_components: the timestamps production never got
-- ============================================================================
-- Forward-only and additive. See supabase/migrations/README.md.
--
-- Found by a full schema comparison of staging against production (2026-10-08),
-- after a code change reached production whose column had not: the same class of
-- mistake, caught before it bit. Everything else the comparison surfaced was
-- already known and deliberate —
--
--   super_admins.*      a table no migration creates and no source file
--                       references, empty on staging too. Vestigial.
--   rate_limits.id      migration 065 left production's key as `ip` on purpose;
--                       nothing reads an `id`.
--
-- These two columns are the only genuine drift: staging has them (NOT NULL,
-- defaulting to now()), production does not. Nothing READS them today — every
-- select names its columns and every upsert supplies its own — so no part of the
-- application is broken by their absence. They are added anyway, because a
-- table whose shape differs between environments is a trap for the next person
-- who writes `select *` against it, and this audit exists precisely to close
-- that kind of gap while it is still cheap.
--
-- No trigger on either environment updates `updated_at`, so none is created
-- here: inventing one would be a behaviour change, not a parity fix.
--
-- Safe on a live table: additive, NOT NULL with a default (Postgres fills it
-- without rewriting the table), and idempotent.
-- ============================================================================

ALTER TABLE public.term_result_components
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.term_result_components.created_at IS
  'When the component score row was first written. Present for shape parity with staging; nothing reads it yet.';
