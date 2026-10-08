-- ============================================================================
-- 071 — Create `audit_logs`, which migration 009 declares and the live database
--       never had
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `audit_logs` is declared in `009_audit_logs.sql` and does not exist in the staging
-- database (verified: `to_regclass('public.audit_logs')` is NULL, and no later
-- migration drops or renames it). Three live routes write to it and every insert has
-- been failing SILENTLY, because none of them checks the result:
--
--   api/auth/change-password        (twice: voluntary change, forced change)
--   api/school-admin/reset-password (admin-issued reset)
--
-- So credential events — who changed whose password, and when, and from where — have
-- not been recorded on staging at all. Production HAS the table (32 rows), so this is
-- staging catching up to production, not a new idea.
--
-- COLUMNS AND INDEXES ARE 009's, VERBATIM. Nothing here is invented, and unlike 009
-- this file is idempotent, so it is safe on a database that already applied 009.
--
-- ONE DELIBERATE DIFFERENCE FROM PRODUCTION: THE POLICY
-- ----------------------------------------------------
-- Production carries `audit_logs` with RLS ENABLED and NO policies — an effective
-- deny-all to anon/authenticated, with only the service role (which bypasses RLS)
-- able to touch it. That is the right posture for a credential audit log, and 009
-- alone would NOT give it: 009 never enables RLS, and Supabase's default grants would
-- leave the table readable with the anon key.
--
-- Mirroring "RLS on, no policies" exactly is not an option here, because the isolation
-- harness's coverage ratchet counts tenant-scoped tables (those carrying `school_id`,
-- which this one does) that have RLS enabled with zero policies, and allows ZERO of
-- them. The table therefore gets the smallest policy that keeps that guarantee
-- meaningful: super-admin read, the same shape `support_logs` already uses for
-- platform-level records. Writes need no policy — they come from the service role.
--
-- No backfill: the events that were not recorded cannot be reconstructed, and
-- inventing audit rows would be fabricating history.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The table, exactly as 009 declares it
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  school_id  UUID,
  event      TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user  ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON public.audit_logs (event);


-- ----------------------------------------------------------------------------
-- 2. Lock it down: RLS on, with one super-admin read policy (see the note above)
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_super_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_super_admin_read ON public.audit_logs
  FOR SELECT USING (is_super_admin());


-- ----------------------------------------------------------------------------
-- 3. What is deliberately NOT here
-- ----------------------------------------------------------------------------
--   * No INSERT/UPDATE/DELETE policy. The writers use the service client, which
--     bypasses RLS; a tenant token must never be able to forge or erase an audit row.
--   * No foreign keys. 009 declares none, and an audit row must survive the deletion
--     of the account it describes — that is the point of an audit trail.
--   * No backfill (nothing to backfill from).
-- ============================================================================
