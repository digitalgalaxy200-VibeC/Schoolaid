-- ============================================================================
-- 054 — Role-aware RLS for the tables migration 043 covered (S3)
-- ============================================================================
-- Forward-only. Replaces policies; no table, column or row is changed.
--
-- THE GAP
-- -------
-- 043 gave 24 tenant-scoped tables four policies each, all using ONE predicate:
--
--     (school_id = jwt.school_id) OR is_super_admin()
--
-- That is tenant isolation, but it is not ROLE isolation. The predicate asks
-- "is this row in your school?" and never asks "are you allowed to write it?".
--
-- So a token carrying `app_role: 'student'` satisfied exactly the same predicate
-- as a teacher's token. With one, a student could INSERT, UPDATE or DELETE their
-- own school's `student_scores`, `term_results`, `term_results_components`,
-- `attendance_records` and report-card comments — i.e. their own marks.
--
-- WHY IT IS NOT EXPLOITABLE TODAY
-- -------------------------------
-- A student cannot obtain a PostgREST token. The tenant-scoped client is built
-- SERVER-SIDE only (`src/lib/cbt/scoped-client.ts`), and the server mints one
-- only after the role and tenant have been authorised. The anon key alone grants
-- nothing, because every policy compares `school_id` to a JWT claim that an anon
-- request does not carry.
--
-- So this is not an open door. It is a door whose only lock is an architectural
-- habit — "never hand a tenant token to a browser" — which is precisely the
-- habit the ordinary Supabase realtime or client-side pattern breaks. The moment
-- any feature does that, every student gains write access to their own marks.
-- Fixing it now costs six lines of SQL; fixing it later costs an incident.
--
-- THE CHANGE
-- ----------
--   SELECT   unchanged — school-scoped, any role holding the school claim.
--   INSERT   staff only — `app_role` in ('teacher','school_admin').
--   UPDATE   staff only.
--   DELETE   staff only.
--   Super admin is untouched everywhere (`is_super_admin()` still passes).
--   The service role bypasses RLS entirely and is unaffected.
--
-- Students keep READING these tables, which is what every student-facing screen
-- needs (report cards, results, attendance). Only writing is withdrawn.
--
-- DELIBERATELY NOT TOUCHED
-- ------------------------
-- `cbt_attempt_answers` carries a `FOR ALL` student policy that this migration
-- does NOT tighten. I checked before assuming: the answer autosave writes through
-- a STUDENT-scoped client (`src/app/api/cbt/attempts/[id]/route.ts`, the
-- `scoped.from("cbt_attempt_answers").upsert(...)` call), so that policy is
-- load-bearing. Tightening it would break sitting a test. Migration 046 already
-- made it the narrowest shape that still works.
--
-- Its residual risk is unchanged and worth stating: a student token could in
-- principle edit an answer on an ALREADY SUBMITTED attempt, because RLS cannot
-- see the attempt's status without a policy subquery. Left alone, because the
-- server refuses post-submission writes and, again, students hold no token.
-- ============================================================================


DO $$
DECLARE
  t          TEXT;
  school     TEXT := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid))';
  -- Writes additionally require a staff role. `app_role` is a separate claim from
  -- `role` on purpose: PostgREST uses `role` to choose the database role, so
  -- overloading it would break the connection.
  staff      TEXT := school
                  || ' AND ((auth.jwt() ->> ''app_role''::text) = ANY (ARRAY[''teacher'',''school_admin'']))';
  read_expr  TEXT;
  write_expr TEXT;

  -- The same list as 043. Kept identical on purpose: this migration changes the
  -- PREDICATE, not which tables are covered, so the two cannot drift apart in
  -- coverage while looking the same.
  tenant_tables TEXT[] := ARRAY[
    'student_scores',
    'term_results',
    'term_result_components',
    'report_card_submissions',
    'attendance_records',
    'psychomotor_scores',
    'affective_scores',
    'teacher_comments',
    'school_admin_comments',
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
    'class_teachers',
    'ai_import_logs'
  ];
BEGIN
  read_expr  := school || ' OR is_super_admin()';
  write_expr := '(' || staff || ') OR is_super_admin()';

  FOREACH t IN ARRAY tenant_tables LOOP

    -- SELECT: unchanged from 043, re-created so this file is the single current
    -- description of the posture for these tables.
    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY tenant_select_%1$s ON public.%1$I FOR SELECT USING (%2$s)',
      t, read_expr);

    -- Writes: staff only. The old role-blind policy names are dropped first so a
    -- database that already ran 043 does not end up with both policies applying —
    -- permissive policies OR together, so leaving the old ones in place would
    -- defeat the whole change.
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert_%1$s ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_staff_insert_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY tenant_staff_insert_%1$s ON public.%1$I FOR INSERT WITH CHECK (%2$s)',
      t, write_expr);

    EXECUTE format('DROP POLICY IF EXISTS tenant_update_%1$s ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_staff_update_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY tenant_staff_update_%1$s ON public.%1$I FOR UPDATE USING (%2$s) WITH CHECK (%2$s)',
      t, write_expr);

    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_%1$s ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_staff_delete_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY tenant_staff_delete_%1$s ON public.%1$I FOR DELETE USING (%2$s)',
      t, write_expr);

  END LOOP;
END $$;
