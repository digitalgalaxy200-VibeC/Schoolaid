-- ============================================================================
-- 044 — Score-level correction audit + correction cycles
-- ============================================================================
-- Forward-only. All columns are nullable/additive; no data is removed.
--
-- WHY
-- PD-3 (final product decision) requires that every change to an official score
-- records: previous value, new value, actor, timestamp, student, subject,
-- component, the reason/context, and the retraction/correction cycle that
-- authorised the change.
--
-- `result_edit_logs` already existed for this purpose but could not satisfy it:
--   - it had NO `school_id`, so it could not be tenant-scoped or RLS-protected;
--   - it recorded only subject-level grade/total, with no component detail;
--   - it had no reason and no link to a retraction.
--
-- Rather than create a second audit table for the same responsibility, the
-- existing one is extended. `term_results` remains untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Extend result_edit_logs
-- ----------------------------------------------------------------------------
ALTER TABLE public.result_edit_logs
  ADD COLUMN IF NOT EXISTS school_id          UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS component_id       UUID,
  ADD COLUMN IF NOT EXISTS action             TEXT,
  ADD COLUMN IF NOT EXISTS previous_score     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS new_score          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS reason             TEXT,
  ADD COLUMN IF NOT EXISTS correction_cycle_id UUID;

-- Backfill school_id from the student so existing rows become tenant-scoped.
UPDATE public.result_edit_logs l
   SET school_id = s.school_id
  FROM public.students s
 WHERE l.student_id = s.id
   AND l.school_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_result_edit_logs_school_student
  ON public.result_edit_logs (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_result_edit_logs_cycle
  ON public.result_edit_logs (correction_cycle_id);

-- A score row may legitimately have no subject (the column is optional on
-- student_scores), so the audit row must be able to record that too.
ALTER TABLE public.result_edit_logs ALTER COLUMN subject_id DROP NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. Correction cycles on report_card_submissions
-- ----------------------------------------------------------------------------
-- Retraction is whole-class + term (PD-3). Each retraction opens a correction
-- cycle; edits made while the class is retracted carry that cycle's id, so the
-- School Admin can see exactly which changes belong to which retraction.
ALTER TABLE public.report_card_submissions
  ADD COLUMN IF NOT EXISTS correction_cycle_id UUID;


-- ----------------------------------------------------------------------------
-- 3. Tenant policies for result_edit_logs
-- ----------------------------------------------------------------------------
-- The table previously had RLS enabled with NO policies (deny-all). Now that it
-- carries school_id it becomes tenant-scoped: a school may read its own
-- correction history, and the platform may read everything.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_select_result_edit_logs ON public.result_edit_logs;
CREATE POLICY tenant_select_result_edit_logs ON public.result_edit_logs
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_result_edit_logs ON public.result_edit_logs;
CREATE POLICY tenant_insert_result_edit_logs ON public.result_edit_logs
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS platform_delete_result_edit_logs ON public.result_edit_logs;
CREATE POLICY platform_delete_result_edit_logs ON public.result_edit_logs
  FOR DELETE USING (is_super_admin());

-- No UPDATE policy on purpose: an audit trail that can be edited is not an
-- audit trail. Updates are denied to everyone except the service role.
