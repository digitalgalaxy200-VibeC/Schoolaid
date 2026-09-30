-- ============================================================================
-- SchoolAid — Migration 027: Finance Phase 1 — allocation & integrity
-- Additive + idempotent. Requires migrations 013 and 026 to be applied first
-- (guarded with to_regclass so it is also safe on a DB without them).
--
-- Contents:
--   1. fee_allocations — payment ↔ bill-line allocation (partial payments).
--      A student_fee is "paid" when SUM(fee_allocations.amount) >= net_amount;
--      balances are derived from allocations, NOT from student_fees.is_paid.
--   2. Receipt numbering scoped per school (receipt_number unique per school,
--      not globally) — generation happens in the app with a per-school counter.
--   3. class_id snapshot on student_fees — a bill keeps the class (and thus
--      pricing context) the student was in when the bill was generated, so
--      promotions never rewrite historical bills.
--   4. [PENDING DECISION] section binding — academic_level_id on
--      section_fee_defaults (Option A, recommended). If Option B (stay on
--      grade_level TEXT) is chosen, delete section 4 before applying.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FEE ALLOCATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id),
  payment_id     UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  student_fee_id UUID NOT NULL REFERENCES student_fees(id),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payment_id, student_fee_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_alloc_school  ON fee_allocations (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_fee     ON fee_allocations (student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_payment ON fee_allocations (payment_id);

-- RLS + tenant policies (same style as 001/026)
ALTER TABLE fee_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_fee_allocations ON fee_allocations;
CREATE POLICY tenant_select_fee_allocations ON fee_allocations
  FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_fee_allocations ON fee_allocations;
CREATE POLICY tenant_insert_fee_allocations ON fee_allocations
  FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_fee_allocations ON fee_allocations;
CREATE POLICY tenant_update_fee_allocations ON fee_allocations
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_fee_allocations ON fee_allocations;
CREATE POLICY tenant_delete_fee_allocations ON fee_allocations
  FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- ----------------------------------------------------------------------------
-- 2. RECEIPTS — per-school receipt numbering
--    (receipt_number unique within a school instead of globally; the app
--     generates numbers via a per-school counter, the constraint is the
--     safety net)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL THEN
    ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_receipt_number_key;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_receipt_number_school_key') THEN
      ALTER TABLE receipts ADD CONSTRAINT receipts_receipt_number_school_key UNIQUE (school_id, receipt_number);
    END IF;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. STUDENT FEES — class snapshot column
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.student_fees') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'student_fees' AND column_name = 'class_id') THEN
    ALTER TABLE student_fees ADD COLUMN class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_student_fees_class ON student_fees (class_id);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. [PENDING DECISION — Option A] SECTION BINDING
--    Binds section_fee_defaults to academic_levels (the canonical section
--    model from migration 019). Resolution at billing time:
--      class → classes.academic_level_id → section default
--      class → class_fee_overrides (exception wins)
--    If Option B (keep grade_level TEXT) is chosen, DELETE this section.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.section_fee_defaults') IS NOT NULL
     AND to_regclass('public.academic_levels') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'section_fee_defaults' AND column_name = 'academic_level_id') THEN
    ALTER TABLE section_fee_defaults ADD COLUMN academic_level_id UUID REFERENCES academic_levels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_level ON section_fee_defaults (academic_level_id);
  END IF;
END;
$$;
