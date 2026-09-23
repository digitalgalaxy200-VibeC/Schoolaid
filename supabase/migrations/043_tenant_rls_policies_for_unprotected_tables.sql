-- ============================================================================
-- 043 — Tenant RLS policies for tables that had RLS enabled but no policies
-- ============================================================================
-- Forward-only. Adds policies only; no table, column or data is modified.
-- See supabase/migrations/README.md.
--
-- BACKGROUND
-- Every public table has RLS enabled, but 28 tenant-scoped tables had ZERO
-- policies. RLS-enabled-with-no-policies denies everyone, so those tables were
-- effectively service-role-only. That was invisible because 100/107 API routes
-- use the service-role client, which bypasses RLS entirely.
--
-- The consequence matters for the CBT work: any table a tenant-scoped client
-- reads without policies would silently return nothing. This migration closes
-- that gap for the academically critical tables (marks, results, attendance,
-- comments, submissions) and the configuration tables they depend on.
--
-- POLICY CONVENTION (matches the existing platform policy set):
--   (school_id = (auth.jwt() ->> 'school_id')::uuid) OR is_super_admin()
--
-- Note: adding these policies does NOT change current application behaviour.
-- Service-role requests still bypass RLS. The policies take effect only for
-- requests that carry a user JWT, which is exactly the CBT client's design.
-- ============================================================================

DO $$
DECLARE
  t            TEXT;
  policy_expr  TEXT := '(school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) OR is_super_admin()';

  -- School-owned data: a tenant may read and manage its own rows.
  tenant_tables TEXT[] := ARRAY[
    -- marks, results and attendance (the academically critical set)
    'student_scores',
    'term_results',
    'term_result_components',
    'report_card_submissions',
    'attendance_records',
    'psychomotor_scores',
    'affective_scores',
    'teacher_comments',
    'school_admin_comments',
    -- assessment configuration
    'components_templates',
    'grading_templates',
    'psychomotor_templates',
    'affective_templates',
    'class_components_templates',
    'class_grading_templates',
    'class_psychomotor_templates',
    'class_affective_templates',
    'level_components_templates',
    'level_grading_templates',
    'level_psychomotor_templates',
    'level_affective_templates',
    'academic_levels',
    -- assignments and import logs
    'class_teachers',
    'ai_import_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY tenant_select_%1$s ON public.%1$I FOR SELECT USING (%2$s)', t, policy_expr);

    EXECUTE format('DROP POLICY IF EXISTS tenant_insert_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY tenant_insert_%1$s ON public.%1$I FOR INSERT WITH CHECK (%2$s)', t, policy_expr);

    EXECUTE format('DROP POLICY IF EXISTS tenant_update_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY tenant_update_%1$s ON public.%1$I FOR UPDATE USING (%2$s) WITH CHECK (%2$s)', t, policy_expr);

    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY tenant_delete_%1$s ON public.%1$I FOR DELETE USING (%2$s)', t, policy_expr);
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- school_features — a school may READ its own feature flags, but only the
-- platform may change them. Writes stay super-admin only.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_select_school_features ON public.school_features;
CREATE POLICY tenant_select_school_features ON public.school_features
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS platform_write_school_features ON public.school_features;
CREATE POLICY platform_write_school_features ON public.school_features
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ----------------------------------------------------------------------------
-- copilot_* — the Super Admin Copilot is a platform-level capability, not school
-- data. These must NOT become tenant-readable, so they get super-admin-only
-- policies rather than tenant ones.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  platform_tables TEXT[] := ARRAY[
    'copilot_conversations',
    'copilot_operations',
    'copilot_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY platform_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_only_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY platform_only_%1$s ON public.%1$I FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin())',
      t
    );
  END LOOP;
END $$;
