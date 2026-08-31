-- ============================================================================
-- SchoolAid — Migration 028: Finance Phase 2 — additive structures
-- TARGET: the MIGRATED live schema (requires fee_heads, term_fees, class_fees,
--         payments, receipts, student_waivers, academic_sections to exist).
--         Do NOT concatenate into the repo's staging_complete_schema.sql
--         (that file builds the repository schema, not the migrated one).
--
-- APPROVED PHASE 1 ARCHITECTURE — additive only:
--   • student_waivers.term_id           (waivers become term-scoped)
--   • payments.recorded_by/notes/status (audit trail + void support)
--   • fee_heads.is_active/display_order (ordering/soft-disable)
--   • student_bills + student_bill_lines (historical bill SNAPSHOT — bills are
--     immutable once generated; class/fee changes never rewrite them)
--   • fee_allocations                    (payment ↔ bill-line allocation,
--     partial payments; balances = bill − waivers − allocations)
--   • payment_plans + payment_plan_installments (instalments)
--   • RLS tenant policies on all finance tables missing them
--
-- Idempotent + guarded: safe to re-run. NO DROP / TRUNCATE / DELETE / RENAME.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADDITIVE COLUMNS (existing migrated tables)
-- ----------------------------------------------------------------------------

-- student_waivers: term scope so a waiver cannot float across terms
ALTER TABLE student_waivers ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_student_waivers_term ON student_waivers (term_id);
CREATE INDEX IF NOT EXISTS idx_student_waivers_student ON student_waivers (student_id);

-- payments: audit + void support (recorded_by kept FK-less: migrated DB has no profiles table)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'voided', 'reversed'));
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_academic_section ON payments (academic_section_id);

-- fee_heads: ordering / soft-disable (is_compulsory already exists)
ALTER TABLE fee_heads ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE fee_heads ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 2. NEW: STUDENT BILLS (historical snapshot header)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_bills (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id),
  student_id           UUID NOT NULL REFERENCES students(id),
  term_id              UUID NOT NULL REFERENCES academic_terms(id),
  academic_section_id  UUID REFERENCES academic_sections(id) ON DELETE SET NULL,
  class_id             UUID REFERENCES classes(id) ON DELETE SET NULL,
  gross_amount         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  waiver_amount        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (waiver_amount >= 0),
  net_amount           DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'void')),
  generated_by         UUID,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, term_id)
);

-- ----------------------------------------------------------------------------
-- 3. NEW: STUDENT BILL LINES (immutable snapshot of each fee at generation time)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_bill_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id        UUID NOT NULL REFERENCES student_bills(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id),
  fee_head_id    UUID NOT NULL REFERENCES fee_heads(id),
  term_fee_id    UUID REFERENCES term_fees(id) ON DELETE SET NULL,   -- source default
  class_fee_id   UUID REFERENCES class_fees(id) ON DELETE SET NULL,  -- source override
  description    TEXT,
  amount         DECIMAL(12,2) NOT NULL CHECK (amount >= 0),         -- amount at generation
  waived_amount  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (waived_amount >= 0),
  is_compulsory  BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. NEW: FEE ALLOCATIONS (payment → bill line)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  payment_id    UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_line_id  UUID NOT NULL REFERENCES student_bill_lines(id) ON DELETE CASCADE,
  amount        DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payment_id, bill_line_id)
);

-- ----------------------------------------------------------------------------
-- 5. NEW: PAYMENT PLANS + INSTALLMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id),
  student_id        UUID NOT NULL REFERENCES students(id),
  bill_id           UUID REFERENCES student_bills(id) ON DELETE SET NULL,
  term_id           UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  total_amount      DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
  installment_count INT NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted', 'cancelled')),
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_plan_installments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id),
  plan_id            UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount             DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  due_date           DATE NOT NULL,
  is_paid            BOOLEAN NOT NULL DEFAULT false,
  paid_date          DATE,
  payment_id         UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, installment_number)
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES (new tables)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_bills_school_term   ON student_bills (school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_student_bills_student       ON student_bills (student_id);
CREATE INDEX IF NOT EXISTS idx_student_bills_class         ON student_bills (class_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill             ON student_bill_lines (bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_school           ON student_bill_lines (school_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_fee_head         ON student_bill_lines (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_school            ON fee_allocations (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_payment           ON fee_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_line              ON fee_allocations (bill_line_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_school        ON payment_plans (school_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_student       ON payment_plans (student_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_bill          ON payment_plans (bill_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_plan      ON payment_plan_installments (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_installments_payment   ON payment_plan_installments (payment_id);

-- ----------------------------------------------------------------------------
-- 7. RLS — tenant policies for NEW tables + any migrated finance table
--    that currently has none (policies are additive; legacy policies stay).
--    NOTE: this migrated DB has NO is_super_admin() helper and school_arms
--    has a TEXT school_id, so policies use an inline JWT check with a
--    ::text cast that works for both UUID and TEXT school_id columns.
--    platform_bank_accounts is excluded (no school_id — platform-wide).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'fee_heads', 'term_fees', 'class_fees', 'student_fee_adjustments',
    'student_waivers', 'payments', 'receipts', 'platform_payments',
    'school_subscriptions', 'school_billing_configs',
    'school_sections', 'school_arms', 'academic_sections',
    'student_bills', 'student_bill_lines', 'fee_allocations',
    'payment_plans', 'payment_plan_installments'
  ];
  existing INTEGER;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('SELECT count(*) FROM pg_policies WHERE schemaname = ''public'' AND tablename = %L', t) INTO existing;
    IF existing = 0 THEN
      EXECUTE format(
        'CREATE POLICY tenant_select_%I ON %I FOR SELECT
           USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_insert_%I ON %I FOR INSERT
           WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_update_%I ON %I FOR UPDATE
           USING (school_id::text = auth.jwt() ->> ''school_id'')
           WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format(
        'CREATE POLICY tenant_delete_%I ON %I FOR DELETE
           USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      RAISE NOTICE '028: added tenant policies to %', t;
    END IF;
  END LOOP;
END;
$$;
