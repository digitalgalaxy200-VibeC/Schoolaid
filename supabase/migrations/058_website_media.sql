-- ============================================================================
-- 058 — Website Engine, Phase 5: website_media
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds ONE table. No existing table, column, policy, index or row is touched,
-- and no row is created here — media rows are written by the upload route when
-- a school adds an image.
--
-- PATHS ARE OPAQUE, DELIBERATELY
-- -----------------------------
-- The platform's older upload routes write `avatars/<school_id>/<file>`, which
-- publishes a school's UUID in every image URL (register TD3). Website media
-- must not repeat that: `path` carries no tenant identifier, so a public asset
-- URL reveals nothing about who owns it. Ownership lives here, in the row.
--
-- `status = 'tombstone'` is a soft delete. The object stays fetchable until the
-- grace period passes, so a page that still references it does not break the
-- moment somebody tidies the library; `scripts/site-media-gc.cjs` removes the
-- object and the row afterwards.
--
-- RLS follows the existing platform convention:
--   (school_id = (auth.jwt() ->> 'school_id')::uuid) OR is_super_admin()
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.website_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Storage key inside the site-assets bucket. Opaque on purpose (see header).
  path        TEXT NOT NULL UNIQUE,
  mime        TEXT NOT NULL,
  bytes       BIGINT NOT NULL CHECK (bytes > 0),

  alt_text    TEXT,
  -- Populated by the derivative job (deferred; see the phase 5 report).
  width       INTEGER,
  height      INTEGER,
  variants    JSONB NOT NULL DEFAULT '{}'::jsonb,

  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'tombstone')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE public.website_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_website_media ON public.website_media;
CREATE POLICY tenant_select_website_media ON public.website_media
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_website_media ON public.website_media;
CREATE POLICY tenant_insert_website_media ON public.website_media
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_website_media ON public.website_media;
CREATE POLICY tenant_update_website_media ON public.website_media
  FOR UPDATE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin())
  WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_website_media ON public.website_media;
CREATE POLICY tenant_delete_website_media ON public.website_media
  FOR DELETE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

-- The library screen lists one school's media newest-first.
CREATE INDEX IF NOT EXISTS idx_website_media_school_created
  ON public.website_media (school_id, created_at DESC);

-- The GC finds tombstones past their grace period without scanning the table.
CREATE INDEX IF NOT EXISTS idx_website_media_tombstones
  ON public.website_media (deleted_at)
  WHERE status = 'tombstone';

DROP TRIGGER IF EXISTS update_website_media_updated_at ON public.website_media;
CREATE TRIGGER update_website_media_updated_at
  BEFORE UPDATE ON public.website_media
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
