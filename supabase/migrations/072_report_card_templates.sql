-- ============================================================================
-- 072 — Create the report-card template tables that migration 012 declares and
--       the live database never had
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `012_report_card_templates.sql` declares five tables plus one column on
-- `term_results`. None of them exist in the staging database, while PRODUCTION HAS
-- ALL OF THEM, with 012's policies under 012's own names (verified: 3 templates, and
-- the eight policies "Anyone can read published templates", "Super admin full access
-- templates", … present in production).
--
-- What that costs on staging today: the school-admin screen **Template Settings**
-- (in the navigation) and the super-admin template screens read those tables. Reads
-- come back empty, and any SAVE answers 500 with a Postgres "relation does not
-- exist" — an error a school admin can do nothing about.
--
-- This file is 012 VERBATIM — same columns, same checks, same unique constraints,
-- same RLS, same policy names — made idempotent, so it is safe both on staging and
-- on a database that already applied 012 (production is a no-op).
--
-- ON THE POLICY SHAPES (a note for whoever reads this next)
-- ---------------------------------------------------------
-- 012's policies are school-wide, not role-aware: "School admin manages own
-- assignments" checks `profiles.role = 'school_admin'` and does not name `app_role`.
-- That is looser than the standard migration 054 later applied to the 24 report-card
-- tables (S3), and it is mirrored here ANYWAY, on purpose: staging and production must
-- describe the same system, and tightening a policy on one side only is how the two
-- databases start disagreeing. If these tables should follow 054's rule, that is a
-- separate, deliberate change to BOTH — not a quiet difference introduced here.
--
-- `report_card_template_versions` ends up with RLS enabled and no policy (012
-- declares none). That is safe and does not trip the isolation ratchet: the table
-- carries no `school_id`, so it is not tenant-scoped — same treatment as
-- `ai_providers` and `components_rows`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Templates (Super Admin managed)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  page_size   TEXT NOT NULL DEFAULT 'A4',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  colors      JSONB DEFAULT '{"primary":"#2A4B8D","accent":"#F0A63A","text":"#16202E"}',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version     INT NOT NULL DEFAULT 1,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Sections within a template
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_template_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.report_card_templates(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  label         TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  config        JSONB DEFAULT '{}',
  is_enabled    BOOLEAN DEFAULT TRUE,
  UNIQUE (template_id, section_key)
);

-- ----------------------------------------------------------------------------
-- 3. Immutable snapshots on publish
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_template_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.report_card_templates(id),
  version       INT NOT NULL,
  frozen_config JSONB NOT NULL,
  published_by  UUID REFERENCES public.profiles(id),
  published_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. A school's template per grade level
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_template_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id),
  grade_level TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.report_card_templates(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, grade_level)
);

-- ----------------------------------------------------------------------------
-- 5. Per-school section toggles and renames
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_template_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id),
  template_id  UUID NOT NULL REFERENCES public.report_card_templates(id),
  section_key  TEXT NOT NULL,
  is_enabled   BOOLEAN DEFAULT TRUE,
  custom_label TEXT,
  UNIQUE (school_id, template_id, section_key)
);

-- ----------------------------------------------------------------------------
-- 6. 012's column on term_results. Unused by the current code — kept because 012
--    declares it, production has it, and dropping it from the mirror would leave the
--    two databases describing different schemas for no gain.
-- ----------------------------------------------------------------------------
ALTER TABLE public.term_results
  ADD COLUMN IF NOT EXISTS template_snapshot_id UUID REFERENCES public.report_card_template_versions(id);

-- ----------------------------------------------------------------------------
-- 7. RLS and policies, 012's own names
-- ----------------------------------------------------------------------------
ALTER TABLE public.report_card_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_card_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_card_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_template_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_template_configs       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published templates" ON public.report_card_templates;
CREATE POLICY "Anyone can read published templates" ON public.report_card_templates
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Super admin full access templates" ON public.report_card_templates;
CREATE POLICY "Super admin full access templates" ON public.report_card_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "Super admin full access sections" ON public.report_card_template_sections;
CREATE POLICY "Super admin full access sections" ON public.report_card_template_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "Anyone can read template sections" ON public.report_card_template_sections;
CREATE POLICY "Anyone can read template sections" ON public.report_card_template_sections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.report_card_templates t WHERE t.id = template_id AND t.status = 'published')
  );

DROP POLICY IF EXISTS "School admin manages own assignments" ON public.school_template_assignments;
CREATE POLICY "School admin manages own assignments" ON public.school_template_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

DROP POLICY IF EXISTS "Anyone can read assignments" ON public.school_template_assignments;
CREATE POLICY "Anyone can read assignments" ON public.school_template_assignments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "School admin manages own configs" ON public.school_template_configs;
CREATE POLICY "School admin manages own configs" ON public.school_template_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

DROP POLICY IF EXISTS "Anyone can read configs" ON public.school_template_configs;
CREATE POLICY "Anyone can read configs" ON public.school_template_configs
  FOR SELECT USING (true);


-- ----------------------------------------------------------------------------
-- 8. What is deliberately NOT here
-- ----------------------------------------------------------------------------
--   * No seed templates. Production holds 3 (authored there); inventing three on
--     staging would look like real school data.
--   * No changes to the routes or screens that read these tables — they already
--     point at these names.
-- ============================================================================
