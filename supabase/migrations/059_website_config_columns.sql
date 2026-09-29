-- ============================================================================
-- 059 — Website Engine, Phase 6: theme, contact and SEO configuration
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY AN ALTER IS CORRECT HERE, AND WHY IT IS A NEW FILE
-- -----------------------------------------------------
-- `website_configs` was created by 057 with exactly the columns phase 5 needed.
-- Editing 057 is forbidden — it has been applied, and the database does not
-- re-run it — so the school-facing configuration (branding, contact links, SEO
-- defaults) arrives as three appended columns instead. Additive, defaulted,
-- and no backfill: every existing row already satisfies the new shape, and
-- `'{}'` means "nothing chosen yet", which every reader treats as the default.
--
-- Nothing else changes: the table's RLS policies are column-agnostic, and no
-- index is needed because these values are read with the row, never searched.
-- ============================================================================

ALTER TABLE public.website_configs
  -- Branding: the chosen palette id and an optional logo override.
  ADD COLUMN IF NOT EXISTS theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Public contact channels the school wants on its site (schools has no
  -- social columns, and widening a core table for a marketing surface is the
  -- wrong trade).
  ADD COLUMN IF NOT EXISTS contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Title and description overrides for the public page's metadata.
  ADD COLUMN IF NOT EXISTS seo JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.website_configs.theme IS
  E'{"palette": "<id from src/lib/site/theme.ts>", "logo_path": "<website_media.path or absent>"}';
COMMENT ON COLUMN public.website_configs.contact IS
  E'{"whatsapp"|"facebook"|"instagram"|"x"|"youtube": "<https url>"}';
COMMENT ON COLUMN public.website_configs.seo IS
  E'{"title": "<string>", "description": "<string>"}';
