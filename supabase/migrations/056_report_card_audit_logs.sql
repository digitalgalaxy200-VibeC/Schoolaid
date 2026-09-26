-- ============================================================================
-- 056 — Create `report_card_audit_logs`, which migration 017 defines but the
--       live database does not have
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `report_card_audit_logs` is declared in `017_report_card_submissions.sql` and has
-- never existed in the staging database. Verified directly against the database
-- (not via PostgREST, whose "not found in the schema cache" can also mean a stale
-- cache): `to_regclass('public.report_card_audit_logs')` returns NULL, no index or
-- policy of that name exists anywhere, and no later migration drops or renames it.
-- Its sibling `report_card_submissions` — created by the same migration — does exist,
-- so 017 was applied in a variant that omitted this table.
--
-- Nine code paths depend on it:
--
--   WRITERS (insert, result ignored, so each has been failing SILENTLY)
--     api/school-admin/report-card-review/[classId]  approve, return, publish,
--                                                    retract, republish
--     api/school-admin/admin-comment                 principal remark edits
--     api/school-admin/students                      student record changes
--     api/teacher/report-card/save                   teacher saves
--     api/teacher/report-card/submit                 class submission
--
--   READERS
--     api/school-admin/report-card-review/[classId]/logs   the School Admin's
--                                                          audit / investigation view
--     api/teacher/report-card/class-data                   "last action" on the class
--
-- The consequence is not cosmetic: "who published this, who retracted it, why, and
-- when" has not been recorded anywhere. That is the trail the agreed retraction
-- workflow depends on ("School Admin must have an audit/investigation view showing
-- what changed, who changed it, when, and the reason"), so Phase 11 cannot be
-- complete while the table is missing.
--
-- WHAT THIS MIGRATION IS
-- ----------------------
-- A faithful creation of the table exactly as 017 declares it — same columns, same
-- foreign keys, same index, same RLS and policy, same grants. Nothing is invented
-- and nothing existing is touched:
--
--   * additive only: CREATE TABLE / CREATE INDEX / CREATE POLICY if absent;
--   * idempotent: safe to re-run, and safe to apply where the table already exists
--     (a database that did apply 017 in full is a no-op);
--   * no data is written, changed or deleted, and no other table is altered;
--   * no backfill: audit rows for events that already happened were never recorded,
--     and inventing them would be fabricating history.
--
-- WHY THE POLICY IS CREATED ONLY IF THERE IS NONE
-- -----------------------------------------------
-- 017's policy is `FOR ALL USING (school_id = auth.jwt()->>'school_id' OR
-- is_super_admin())` — school-scoped, not role-aware. `report_card_audit_logs` was
-- never in migration 043's list, so the S3 role-aware sweep (054) did not cover it,
-- and the isolation harness's section 11 inspects a hardcoded list that does not
-- include it either. This migration deliberately does NOT redesign that policy: if an
-- environment already carries a policy (of any shape) it is left exactly as it is, so
-- applying this file can never downgrade a stricter policy somewhere else.
--
-- NOT INCLUDED, DELIBERATELY
-- --------------------------
-- `audit_logs` (defined in `009_audit_logs.sql`, written by the password change and
-- password reset routes) is ALSO absent from the live database. It is a separate,
-- security-audit gap rather than a report-card one, and it carries `school_id` with no
-- RLS, so giving it a policy is a decision rather than a repair. Reported separately;
-- not touched here.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The table, exactly as 017 declares it
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_card_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcal_class_term ON report_card_audit_logs(class_id, term_id);


-- ----------------------------------------------------------------------------
-- 2. RLS, grants and policy — 017's own definitions, and only if absent
-- ----------------------------------------------------------------------------
ALTER TABLE report_card_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON report_card_audit_logs TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'report_card_audit_logs'
  ) THEN
    CREATE POLICY tenant_all_rcal ON report_card_audit_logs
      FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
      WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3. What is deliberately NOT here
-- ----------------------------------------------------------------------------
--   * No backfill of historical events (they were never captured).
--   * No change to the writers: they already target this table and ignore the
--     result, so they start working the moment it exists.
--   * No trigger making the log append-only. Worth considering separately — a
--     BEFORE UPDATE/DELETE trigger here would follow the 046/050 precedent, and
--     nothing in the codebase updates or deletes a report-card audit row.
-- ============================================================================
