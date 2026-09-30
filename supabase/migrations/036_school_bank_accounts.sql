-- ============================================================================
-- 036 — Phase A: Student Payment Workspace foundations (additive only)
--  1) school_bank_accounts — accounts parents pay into (any number)
--  2) payments: which account it was paid into (+ immutable snapshot text)
--  3) students.parent_name — guardian name for workspace + receipts
-- ============================================================================

CREATE TABLE IF NOT EXISTS school_bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  bank_name      TEXT NOT NULL,
  account_name   TEXT NOT NULL,
  account_number TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  display_order  INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_bank_accounts ON school_bank_accounts (school_id, bank_name, account_number);

-- The account the payment was recorded into. school_account_id may become
-- dangling if the school later edits accounts — paid_into keeps the immutable
-- display snapshot so historical receipts never change.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS school_account_id UUID REFERENCES school_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_into TEXT;

-- Guardian name used by the finance workspace and receipts (phone already exists)
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;

-- RLS: tenant-scoped, matching every other finance table
ALTER TABLE school_bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_bank_accounts') THEN
    CREATE POLICY tenant_select_school_bank_accounts ON school_bank_accounts
      FOR SELECT USING (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_insert_school_bank_accounts ON school_bank_accounts
      FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_update_school_bank_accounts ON school_bank_accounts
      FOR UPDATE USING (school_id::text = auth.jwt() ->> 'school_id')
      WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_delete_school_bank_accounts ON school_bank_accounts
      FOR DELETE USING (school_id::text = auth.jwt() ->> 'school_id');
  END IF;
END;
$$;
