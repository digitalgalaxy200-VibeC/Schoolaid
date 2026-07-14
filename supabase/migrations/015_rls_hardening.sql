-- ============================================================================
-- SchoolAid — Migration 015: RLS Hardening
-- ============================================================================
-- Migrations 005 (assessment tables), 008 (class_teachers), and 011
-- (separated templates + score tables) created 21 tables that were never
-- covered by the tenant-isolation RLS pattern from migration 001 — that
-- migration's dynamic loop only covers the fixed list of tables named in
-- its own ARRAY[...] at the time it ran, and later migrations creating new
-- tables must enable RLS for themselves (002, 009, and part of 010 did this
-- correctly; 005, 008, and 011 did not).
--
-- Worst case found: migration 011 explicitly does
--   GRANT ALL ON student_scores TO anon, authenticated, service_role;
-- (and 14 other tables) with zero RLS — meaning the public anon key,
-- which is embedded in client-side JS by design, had unrestricted
-- read/write access to every school's grades via a direct PostgREST call,
-- completely bypassing the Next.js app. See docs/CORRECTIONS_SECURITE.md.
--
-- This migration applies the exact same tenant_policy()/is_super_admin()
-- pattern already used successfully elsewhere in this schema (migrations
-- 001, 002, 009, 010) to all 21 previously-unprotected tables. It grants
-- school-level isolation, matching the rest of the schema — it does not add
-- further per-role (student-only-sees-own-record, teacher-only-sees-
-- assigned-class) filtering at the database layer; that finer-grained
-- scoping is enforced in the application layer (see src/lib/teacher-scope.ts)
-- the same way it already is for the other tenant tables in this schema.
-- ============================================================================

DO $$
DECLARE
  tables_needing_rls TEXT[] := ARRAY[
    -- From migration 005 (still live; 4 of its 12 original tables were
    -- superseded/dropped by migration 010, and its score tables were
    -- superseded again by migration 011 — only these 5 remain):
    'attendance_records', 'teacher_comments', 'term_results',
    'result_edit_logs', 'school_admin_comments',

    -- From migration 008:
    'class_teachers',

    -- From migration 011 (final live versions of the templating + score
    -- tables — these are the ones with the explicit anon GRANT and zero RLS):
    'components_templates', 'class_components_templates', 'components_rows',
    'grading_templates', 'class_grading_templates', 'grading_rows',
    'psychomotor_templates', 'class_psychomotor_templates', 'psychomotor_rows',
    'affective_templates', 'class_affective_templates', 'affective_rows',
    'student_scores', 'psychomotor_scores', 'affective_scores'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_needing_rls
  LOOP
    -- Make sure service_role/anon/authenticated have the same baseline
    -- grant as every other tenant table in this schema (RLS below is what
    -- actually restricts anon/authenticated to their own school's rows;
    -- service_role bypasses RLS as usual for the app's own server-side use).
    EXECUTE format('GRANT ALL ON %I TO anon, authenticated, service_role;', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON %I
         FOR SELECT
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_insert_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_insert_%I ON %I
         FOR INSERT
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_update_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_update_%I ON %I
         FOR UPDATE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin())
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_%I ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_delete_%I ON %I
         FOR DELETE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );
  END LOOP;
END;
$$;

-- Sanity check you can re-run manually after applying: this should return
-- zero rows. If it doesn't, a table was missed.
--
-- SELECT c.relname FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
-- AND c.relname NOT IN ('schema_migrations');
