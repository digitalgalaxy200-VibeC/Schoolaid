-- ============================================================================
-- 066 — Website Engine: Custom domain routing support
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds custom_domain and domain_status to website_configs so schools can route
-- their public website through their own registered host (e.g. greensprings.edu.ng).
--
-- Lowercased unique index guarantees no two schools can claim the same domain.
-- ============================================================================

ALTER TABLE public.website_configs
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS domain_status TEXT NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_website_configs_custom_domain
  ON public.website_configs (lower(trim(custom_domain)))
  WHERE custom_domain IS NOT NULL AND trim(custom_domain) <> '';

COMMENT ON COLUMN public.website_configs.custom_domain IS
  'Custom domain name (e.g. schoolname.edu.ng or portal.school.com). Unique per school across the platform.';

COMMENT ON COLUMN public.website_configs.domain_status IS
  'Domain routing state: active, pending, or disabled.';
