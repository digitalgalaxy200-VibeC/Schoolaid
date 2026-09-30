-- ============================================================================
-- 046 — Attempt integrity: immutability and least-privilege policies
-- ============================================================================
-- Tightens the Phase 14 attempt-scoped policies. Additive and corrective; no
-- table, column or row is changed.
--
-- THE PROBLEM
-- Phase 14 gave the three attempt-scoped tables a single policy:
--
--     FOR ALL USING (own rows OR staff)
--
-- `FOR ALL` includes UPDATE and DELETE. That let a student rewrite their own
--   - cbt_attempts.started_at / expires_at / attempt_number
--     which breaks server-authoritative timing (spec §12), and
--   - cbt_attempt_questions rows
--     which breaks the attempt snapshot (PD-4: editing a question must never
--     change what a past student saw — and neither may the student).
--
-- THE FIX
-- Least privilege per table, by operation:
--
--   cbt_attempts           student: SELECT own only   (timing is server-owned)
--   cbt_attempt_questions  student: SELECT own only   (snapshot is server-owned)
--   cbt_attempt_answers    student: SELECT/INSERT/UPDATE/DELETE own
--                                     (answering, and clearing an answer, are
--                                      legitimate student actions)
--
-- Staff keep full access within their school; the service role bypasses RLS.
--
-- Note on who writes the snapshot: building it requires reading the question
-- bank, which students cannot read. The snapshot is therefore assembled by the
-- server with the service-role client, and students only ever read it back.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tighten the attempt-scoped policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS cbt_owner_all_cbt_attempts ON public.cbt_attempts;
DROP POLICY IF EXISTS cbt_owner_all_cbt_attempt_questions ON public.cbt_attempt_questions;
DROP POLICY IF EXISTS cbt_owner_all_cbt_attempt_answers ON public.cbt_attempt_answers;

DO $$
DECLARE
  staff TEXT := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) '
             || 'AND ((auth.jwt() ->> ''app_role''::text) = ANY (ARRAY[''teacher'',''school_admin''])))';
  own   TEXT := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) '
             || 'AND ((auth.jwt() ->> ''app_role''::text) = ''student'') '
             || 'AND (student_profile_id = ((auth.jwt() ->> ''sub''::text))::uuid))';
  staff_or_super TEXT;
BEGIN
  staff_or_super := staff || ' OR is_super_admin()';

  -- cbt_attempts: read-only to the owning student.
  EXECUTE format('CREATE POLICY cbt_staff_all_cbt_attempts ON public.cbt_attempts
                  FOR ALL USING (%s) WITH CHECK (%s)', staff_or_super, staff_or_super);
  EXECUTE format('CREATE POLICY cbt_student_select_cbt_attempts ON public.cbt_attempts
                  FOR SELECT USING (%s)', own);

  -- cbt_attempt_questions: read-only to the owning student.
  EXECUTE format('CREATE POLICY cbt_staff_all_cbt_attempt_questions ON public.cbt_attempt_questions
                  FOR ALL USING (%s) WITH CHECK (%s)', staff_or_super, staff_or_super);
  EXECUTE format('CREATE POLICY cbt_student_select_cbt_attempt_questions ON public.cbt_attempt_questions
                  FOR SELECT USING (%s)', own);

  -- cbt_attempt_answers: the student owns their responses.
  EXECUTE format('CREATE POLICY cbt_staff_all_cbt_attempt_answers ON public.cbt_attempt_answers
                  FOR ALL USING (%s) WITH CHECK (%s)', staff_or_super, staff_or_super);
  EXECUTE format('CREATE POLICY cbt_student_write_cbt_attempt_answers ON public.cbt_attempt_answers
                  FOR ALL USING (%s) WITH CHECK (%s)', own, own);
END $$;


-- ----------------------------------------------------------------------------
-- 2. Immutability guard on the snapshot
-- ----------------------------------------------------------------------------
-- The policies above stop students. This stops everyone else, including the
-- service role, from silently rewriting history: an UPDATE to a snapshot row
-- raises instead of succeeding.
--
-- UPDATE only, deliberately. DELETE is left alone so that legitimate cleanup
-- (cascading from a deleted assessment or student) still works; RLS already
-- restricts DELETE to staff.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_block_snapshot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'CBT attempt snapshots are immutable (PD-4). Editing a question must never '
    'change what a past student saw, so cbt_attempt_questions cannot be updated. '
    'Correct the result instead, through the audited correction workflow.';
END;
$$;

DROP TRIGGER IF EXISTS cbt_no_update_attempt_questions ON public.cbt_attempt_questions;
CREATE TRIGGER cbt_no_update_attempt_questions
  BEFORE UPDATE ON public.cbt_attempt_questions
  FOR EACH ROW EXECUTE FUNCTION public.cbt_block_snapshot_update();
