-- ============================================================================
-- 057 — Website Engine, Slice 1: website_configs
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds ONE table. No existing table, column, policy, index or row is touched,
-- and no row is created here — a configuration row is created lazily when a
-- school first opens the Website screen (later slice), and by the provisioning
-- path for new schools.
--
-- `status` is the per-school kill switch. The operator UI arrives in a later
-- slice; enforcement reads this column from the first day the public renderer
-- exists, so suspension is designed in rather than retrofitted.
--
-- RLS follows the existing platform convention:
--   (school_id = (auth.jwt() ->> 'school_id')::uuid) OR is_super_admin()
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.website_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Which platform template this school's website is bound to.
  template_key TEXT NOT NULL DEFAULT 'classic',

  -- active    = serve the published site
  -- suspended = temporarily not served (notice semantics defined later)
  -- disabled  = taken down (takedown / offboarding)
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended', 'disabled')),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.website_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_website_configs ON public.website_configs;
CREATE POLICY tenant_select_website_configs ON public.website_configs
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_website_configs ON public.website_configs;
CREATE POLICY tenant_insert_website_configs ON public.website_configs
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_website_configs ON public.website_configs;
CREATE POLICY tenant_update_website_configs ON public.website_configs
  FOR UPDATE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin())
  WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_website_configs ON public.website_configs;
CREATE POLICY tenant_delete_website_configs ON public.website_configs
  FOR DELETE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP TRIGGER IF EXISTS update_website_configs_updated_at ON public.website_configs;
CREATE TRIGGER update_website_configs_updated_at
  BEFORE UPDATE ON public.website_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
