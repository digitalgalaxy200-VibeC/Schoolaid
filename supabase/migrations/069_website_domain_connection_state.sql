-- ============================================================================
-- 069 — Custom domains: a connection state that can be true
-- ============================================================================
-- Forward-only and additive. See supabase/migrations/README.md.
--
-- 066 added `custom_domain`, `domain_status` and the lowercased UNIQUE index
-- that stops two schools claiming one domain. What it could not do is make the
-- status MEAN anything: `domain_status` defaults to 'active' and no code has ever
-- written it, so the Super Admin panel has been reporting a connection nobody
-- checked. (The panel's green "Active" badge was a second, independent fiction.)
--
-- This gives the column a vocabulary that can be true:
--
--   NULL      no domain set — nothing to report
--   pending   registered on our side, waiting for the school's DNS
--   live      DNS verified and serving
--   error     the last check failed; `domain_error` says why
--
-- plus the two columns that make "when was that last true?" answerable.
--
-- NO INDEX WORK HERE. `066` already created
-- `idx_website_configs_custom_domain` on lower(trim(custom_domain)) WHERE not
-- null or blank — verified present on staging before this file was written. Do
-- not add a second one; a duplicate index is a second thing to keep in step.
--
-- Safe on a live table: one loosening (NOT NULL → nullable), one default
-- removal, two nullable columns, and a CHECK added AFTER the backfill.
-- ============================================================================

ALTER TABLE public.website_configs
  ALTER COLUMN domain_status DROP NOT NULL,
  ALTER COLUMN domain_status DROP DEFAULT;

ALTER TABLE public.website_configs
  ADD COLUMN IF NOT EXISTS domain_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_error TEXT;

-- Backfill. 'active' was the default, never a measurement, so it is not kept:
-- a configuration with no domain has nothing to report, and one WITH a domain
-- has, at best, been registered on our side and is waiting for DNS.
--
-- Written to be safe to re-run: a row already carrying a real state is left
-- alone, so re-applying this file cannot undo a 'live'.
UPDATE public.website_configs
SET domain_status = NULL
WHERE custom_domain IS NULL
  AND domain_status IS NOT NULL;

UPDATE public.website_configs
SET domain_status = 'pending'
WHERE custom_domain IS NOT NULL
  AND (domain_status IS NULL OR domain_status NOT IN ('pending', 'live', 'error'));

ALTER TABLE public.website_configs
  DROP CONSTRAINT IF EXISTS website_configs_domain_status_check;

ALTER TABLE public.website_configs
  ADD CONSTRAINT website_configs_domain_status_check
  CHECK (domain_status IS NULL OR domain_status IN ('pending', 'live', 'error'));

COMMENT ON COLUMN public.website_configs.custom_domain IS
  'The school''s own domain, lowercased on write. Unique across the platform via idx_website_configs_custom_domain (066).';

COMMENT ON COLUMN public.website_configs.domain_status IS
  'Whether the custom domain actually serves: NULL = no domain, pending = registered here, waiting for the school''s DNS, live = verified and serving, error = last check failed (see domain_error).';

COMMENT ON COLUMN public.website_configs.domain_checked_at IS
  'When domain_status was last established by asking the host. Stale means "not re-checked since".';

COMMENT ON COLUMN public.website_configs.domain_error IS
  'The last failure reported by the host, in words a support person can act on. Cleared on success.';
