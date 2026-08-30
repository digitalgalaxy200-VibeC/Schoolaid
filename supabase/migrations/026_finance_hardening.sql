-- ============================================================================
-- SchoolAid — Migration 026: Finance module hardening
-- Adds what 013_finance_module.sql was missing:
--   1. RLS policies (013 enabled RLS but defined NO policies, so every
--      non-service-role access to the finance tables was denied)
--   2. Indexes on all foreign keys + the dashboard's hot query path
--   3. updated_at triggers on fee_heads / fee_templates
--   4. CHECK constraints so money can never go negative and discounts stay sane
-- Idempotent: safe to run repeatedly. Guards every statement so it also works
-- on a fresh DB even if 013 was never applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS POLICIES — mirror the tenant policy style used in migration 001
--    (school_id must match the caller's JWT school_id, or caller is super_admin)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  finance_tables TEXT[] := ARRAY[
    'fee_heads', 'fee_templates', 'fee_template_items',
    'section_fee_defaults', 'class_fee_overrides', 'student_fees',
    'payments', 'receipts', 'discounts', 'student_discounts',
    'payment_plans', 'payment_plan_installments'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY finance_tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE; -- table doesn't exist (013 not applied yet); skip
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_select_%I ON %I;
       CREATE POLICY tenant_select_%I ON %I
         FOR SELECT
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_insert_%I ON %I;
       CREATE POLICY tenant_insert_%I ON %I
         FOR INSERT
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_update_%I ON %I;
       CREATE POLICY tenant_update_%I ON %I
         FOR UPDATE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin())
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_delete_%I ON %I;
       CREATE POLICY tenant_delete_%I ON %I
         FOR DELETE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. INDEXES — every FK + the dashboard query path (school_id, term_id, is_paid)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fee_heads_school ON fee_heads (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_templates_school ON fee_templates (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_template_items_template ON fee_template_items (template_id);
CREATE INDEX IF NOT EXISTS idx_fee_template_items_head ON fee_template_items (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_school ON section_fee_defaults (school_id);
CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_template ON section_fee_defaults (template_id);
CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_head ON section_fee_defaults (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_school ON class_fee_overrides (school_id);
CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_class ON class_fee_overrides (class_id);
CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_head ON class_fee_overrides (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_school ON student_fees (school_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_term ON student_fees (term_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_head ON student_fees (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_school_term_paid ON student_fees (school_id, term_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_payments_school ON payments (school_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_term ON payments (term_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON payments (recorded_by);
CREATE INDEX IF NOT EXISTS idx_receipts_school ON receipts (school_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts (payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_student ON receipts (student_id);
CREATE INDEX IF NOT EXISTS idx_discounts_school ON discounts (school_id);
CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_student_discounts_school ON student_discounts (school_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_student ON student_discounts (student_id);
CREATE INDEX IF NOT EXISTS idx_student_discounts_discount ON student_discounts (discount_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_school ON payment_plans (school_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_student ON payment_plans (student_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_term ON payment_plans (term_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_plan ON payment_plan_installments (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_payment ON payment_plan_installments (payment_id);

-- ----------------------------------------------------------------------------
-- 3. updated_at TRIGGERS (fee_heads / fee_templates are the only finance
--    tables with an updated_at column)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_fee_heads_updated_at ON fee_heads;
CREATE TRIGGER update_fee_heads_updated_at
  BEFORE UPDATE ON fee_heads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fee_templates_updated_at ON fee_templates;
CREATE TRIGGER update_fee_templates_updated_at
  BEFORE UPDATE ON fee_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. CHECK CONSTRAINTS — money must never be negative; discounts stay sane
--    Each is guarded so re-runs are safe and fresh-DB ordering doesn't matter.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.fee_heads') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_heads_school_name_key') THEN
    BEGIN
      ALTER TABLE fee_heads ADD CONSTRAINT fee_heads_school_name_key UNIQUE (school_id, name);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'fee_heads already contains duplicate (school_id, name) rows; unique constraint NOT added. Deduplicate rows before enabling.';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_template_items_amount_check') THEN
    ALTER TABLE fee_template_items ADD CONSTRAINT fee_template_items_amount_check CHECK (default_amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'section_fee_defaults_amount_check') THEN
    ALTER TABLE section_fee_defaults ADD CONSTRAINT section_fee_defaults_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_fee_overrides_amount_check') THEN
    ALTER TABLE class_fee_overrides ADD CONSTRAINT class_fee_overrides_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_fees_amount_check') THEN
    ALTER TABLE student_fees ADD CONSTRAINT student_fees_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_fees_discount_check') THEN
    ALTER TABLE student_fees ADD CONSTRAINT student_fees_discount_check CHECK (discount_amount >= 0 AND discount_amount <= amount);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_amount_check') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_reprint_count_check') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_reprint_count_check CHECK (reprint_count >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_value_check') THEN
    ALTER TABLE discounts ADD CONSTRAINT discounts_value_check CHECK (value >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_percentage_range_check') THEN
    ALTER TABLE discounts ADD CONSTRAINT discounts_percentage_range_check CHECK (discount_type <> 'percentage' OR value <= 100);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_total_amount_check') THEN
    ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_total_amount_check CHECK (total_amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_installment_count_check') THEN
    ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_installment_count_check CHECK (installment_count >= 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_installments_amount_check') THEN
    ALTER TABLE payment_plan_installments ADD CONSTRAINT plan_installments_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;
