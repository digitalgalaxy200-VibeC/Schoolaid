-- ============================================================================
-- 041 — Finance guided setup wizard progress (additive only)
-- One row per school. Manual step completions (steps that cannot be reliably
-- auto-detected) are stored here as an array of step keys; auto-detected
-- steps are computed live from the school's real finance data by the API.
-- dismissed hides the progress chip from the Finance header (the Setup Guide
-- tab remains reachable any time).
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_setup_progress (
  school_id        UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  completed_steps  TEXT[] NOT NULL DEFAULT '{}',
  dismissed        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- RLS: tenant-scoped, matching every other finance table
ALTER TABLE finance_setup_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'finance_setup_progress') THEN
    CREATE POLICY tenant_select_finance_setup_progress ON finance_setup_progress
      FOR SELECT USING (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_insert_finance_setup_progress ON finance_setup_progress
      FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_update_finance_setup_progress ON finance_setup_progress
      FOR UPDATE USING (school_id::text = auth.jwt() ->> 'school_id')
      WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_delete_finance_setup_progress ON finance_setup_progress
      FOR DELETE USING (school_id::text = auth.jwt() ->> 'school_id');
  END IF;
END;
$$;
