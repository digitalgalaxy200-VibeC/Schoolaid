-- ============================================================================
-- 065 — rate_limits: reconcile production to the shape migration 042 intended
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY THIS EXISTS
--   Migration 042 created `rate_limits` and `bump_rate_limit()` so login
--   throttling would have shared state instead of per-instance memory. It
--   guarded the table with `CREATE TABLE IF NOT EXISTS` — and production
--   ALREADY had a `rate_limits` table from an earlier generation, in a
--   different shape:
--
--     production : (ip PK, attempts, expires_at)          — 3 columns
--     staging    : (id, ip UNIQUE, attempts, expires_at,
--                   created_at, updated_at)               — 6 columns
--
--   So on production the CREATE was skipped and only the FUNCTION was created.
--   `bump_rate_limit()` inserts into a column the table does not have:
--
--     ERROR: 42703: column "updated_at" of relation "rate_limits" does not exist
--
--   `src/lib/rate-limit.ts` catches that error and — correctly, by design —
--   FAILS CLOSED (`return false`). The result is that the login route answered
--   429 "Too many attempts." to EVERY attempt: not a limit being reached, but
--   the check itself erroring. Production login was down.
--
--   This is the same trap migration 064 was written for: `CREATE TABLE IF NOT
--   EXISTS` silently does nothing against a table that already exists, and the
--   database is left looking migrated while missing columns the code reads.
--
-- WHAT THIS DOES
--   Adds the two columns the function needs, and `created_at` for width. All
--   additive. Existing rows are backfilled by the DEFAULT.
--
-- DELIBERATELY NOT DONE
--   The primary key is left on `ip` (production) rather than moved to `id`
--   (staging). `ON CONFLICT (ip)` needs a unique constraint on `ip`, which
--   `rate_limits_pkey` already provides, and nothing in the codebase reads a
--   `rate_limits` column directly — the only consumer is the function, through
--   `src/lib/rate-limit.ts`. Moving a primary key on a live table to gain
--   cosmetic parity is risk without benefit.
--
--   `id` is therefore not added either. A column that exists to be ignored is
--   worse than its absence: it invites the next reader to assume it is the key.
-- ============================================================================

ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing rows predate these columns, so give them a truthful value
-- rather than the DEFAULT's "now" (which would claim every attempt happened at
-- migration time). `expires_at` minus the 60s window is the closest honest
-- estimate available, and it only affects the audit value of the timestamp.
UPDATE public.rate_limits
   SET created_at = expires_at - INTERVAL '1 minute',
       updated_at = expires_at - INTERVAL '1 minute'
 WHERE created_at > now() - INTERVAL '1 second'
   AND updated_at > now() - INTERVAL '1 second';

-- ============================================================================
-- VERIFY after applying:
--   select public.bump_rate_limit('203.0.113.9', 5, 60000);   -- expect true
--   select count(*) from information_schema.columns
--    where table_name = 'rate_limits'
--      and column_name in ('created_at','updated_at');        -- expect 2
-- ============================================================================
