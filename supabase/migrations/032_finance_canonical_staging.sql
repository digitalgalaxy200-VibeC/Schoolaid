-- ============================================================================
-- SchoolAid — Migration 032: Canonical Finance schema (STAGING build)
-- TARGET: the REAL staging database (noyegdgrfzopfrwjunot — repo-generation
-- schema: profiles-based, classes have no section_id, students carry names in
-- profiles). Approved direction: rebuild the Finance tables on STAGING ONLY;
-- production stays untouched until Finance is proven here.
--
--  PART A — compatibility layer (additive, repo-schema → finance-ready)
--    1. academic_sections (per-term section model used by term_fees/classes)
--    2. classes.section_id
--    3. students.is_active / first_name / last_name / middle_name
--       (backfilled from profiles.full_name — additive, non-destructive)
--  PART B — canonical Finance tables (the migrated-style architecture our
--    Phase 2-5 APIs are built on)
--  PART C — constraints, indexes, RLS tenant policies (inline JWT check —
--    no dependency on helper functions that may not exist here)
--
-- Fully additive + idempotent. No DROP / TRUNCATE / DELETE / RENAME.
-- ============================================================================

-- ============================================================================
-- PART A — COMPATIBILITY LAYER
-- ============================================================================

-- A1. academic_sections (per-term section bindings)
CREATE TABLE IF NOT EXISTS academic_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
  term_id          UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  vacation_date    DATE,
  resumption_date  DATE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- A2. classes → section linkage
ALTER TABLE classes ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES academic_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classes_section ON classes (section_id);

-- A3. students: finance display + filter fields (repo schema stores names in profiles)
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS middle_name TEXT;
CREATE INDEX IF NOT EXISTS idx_students_active ON students (is_active);

-- Backfill names from profiles where empty (additive; existing data preserved)
UPDATE students s
SET first_name = COALESCE(NULLIF(s.first_name, ''), split_part(p.full_name, ' ', 1)),
    last_name  = COALESCE(NULLIF(s.last_name, ''), 
                 CASE WHEN strpos(p.full_name, ' ') > 0 THEN substr(p.full_name, strpos(p.full_name, ' ') + 1) ELSE '' END)
FROM profiles p
WHERE p.id = s.profile_id
  AND (s.first_name IS NULL OR s.last_name IS NULL);

-- ============================================================================
-- PART B — CANONICAL FINANCE TABLES
-- ============================================================================

-- B1. fee_heads — school-defined fee types (is_compulsory model)
CREATE TABLE IF NOT EXISTS fee_heads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  name          TEXT NOT NULL,
  description   TEXT,
  is_compulsory BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_heads_school_name ON fee_heads (school_id, name);

-- B2. term_fees — default fees (school-wide or per academic_section, term-scoped)
CREATE TABLE IF NOT EXISTS term_fees (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  academic_section_id UUID REFERENCES academic_sections(id) ON DELETE SET NULL,
  term_id             UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  fee_head_id         UUID NOT NULL REFERENCES fee_heads(id),
  default_amount      DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  fee_type            TEXT NOT NULL DEFAULT 'Required' CHECK (fee_type IN ('Required', 'Not Required')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- B3. class_fees — per-class overrides of term_fees
CREATE TABLE IF NOT EXISTS class_fees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  term_fee_id   UUID NOT NULL REFERENCES term_fees(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id),
  amount        DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  is_compulsory BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (term_fee_id, class_id)
);

-- B4. student_fee_adjustments — optional-fee opt-in/out per student
CREATE TABLE IF NOT EXISTS student_fee_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_fee_id UUID NOT NULL REFERENCES class_fees(id) ON DELETE CASCADE,
  is_opted_in  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- B5. student_waivers — term-scoped discounts (bill-level or fee-specific)
CREATE TABLE IF NOT EXISTS student_waivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id     UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  waiver_type TEXT NOT NULL DEFAULT 'fixed' CHECK (waiver_type IN ('fixed', 'percentage')),
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- B6. payments — money actually received (canonical migrated-style)
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id),
  student_id     UUID NOT NULL REFERENCES students(id),
  term_id        UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  method         TEXT,
  reference      TEXT,
  receipt_number TEXT,
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by    UUID,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided', 'reversed')),
  voided_by      UUID,
  voided_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (receipt_number)
);

-- B7. receipts — receipt records linked to payments
CREATE TABLE IF NOT EXISTS receipts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id),
  receipt_number TEXT NOT NULL,
  file_url       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, receipt_number)
);

-- B8. student_bills — historical snapshot header (one per student per term)
CREATE TABLE IF NOT EXISTS student_bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  student_id          UUID NOT NULL REFERENCES students(id),
  term_id             UUID NOT NULL REFERENCES academic_terms(id),
  academic_section_id UUID REFERENCES academic_sections(id) ON DELETE SET NULL,
  class_id            UUID REFERENCES classes(id) ON DELETE SET NULL,
  gross_amount        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  waiver_amount       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (waiver_amount >= 0),
  net_amount          DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'void')),
  generated_by        UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, term_id)
);

-- B9. student_bill_lines — immutable snapshot lines
CREATE TABLE IF NOT EXISTS student_bill_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       UUID NOT NULL REFERENCES student_bills(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES schools(id),
  fee_head_id   UUID NOT NULL REFERENCES fee_heads(id),
  term_fee_id   UUID REFERENCES term_fees(id) ON DELETE SET NULL,
  class_fee_id  UUID REFERENCES class_fees(id) ON DELETE SET NULL,
  description   TEXT,
  amount        DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  waived_amount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (waived_amount >= 0),
  is_compulsory BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- B10. fee_allocations — payment → bill line allocation (partial payments)
CREATE TABLE IF NOT EXISTS fee_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id),
  payment_id   UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_line_id UUID NOT NULL REFERENCES student_bill_lines(id) ON DELETE CASCADE,
  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payment_id, bill_line_id)
);

-- B11. payment_plans + installments — schedules (never payments themselves)
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

-- ============================================================================
-- PART C — INDEXES + RLS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_term_fees_school      ON term_fees (school_id);
CREATE INDEX IF NOT EXISTS idx_term_fees_term        ON term_fees (term_id);
CREATE INDEX IF NOT EXISTS idx_term_fees_section     ON term_fees (academic_section_id);
CREATE INDEX IF NOT EXISTS idx_term_fees_fee_head    ON term_fees (fee_head_id);
CREATE INDEX IF NOT EXISTS idx_class_fees_school     ON class_fees (school_id);
CREATE INDEX IF NOT EXISTS idx_class_fees_term_fee   ON class_fees (term_fee_id);
CREATE INDEX IF NOT EXISTS idx_class_fees_class      ON class_fees (class_id);
CREATE INDEX IF NOT EXISTS idx_sfa_student           ON student_fee_adjustments (student_id);
CREATE INDEX IF NOT EXISTS idx_sfa_class_fee         ON student_fee_adjustments (class_fee_id);
CREATE INDEX IF NOT EXISTS idx_sw_student_term       ON student_waivers (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_payments_student      ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_term         ON payments (term_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments (status);
CREATE INDEX IF NOT EXISTS idx_receipts_payment      ON receipts (payment_id);
CREATE INDEX IF NOT EXISTS idx_bills_school_term     ON student_bills (school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_bills_student         ON student_bills (student_id);
CREATE INDEX IF NOT EXISTS idx_bills_class           ON student_bills (class_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill       ON student_bill_lines (bill_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_payment     ON fee_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_line        ON fee_allocations (bill_line_id);
CREATE INDEX IF NOT EXISTS idx_plans_student         ON payment_plans (student_id);
CREATE INDEX IF NOT EXISTS idx_inst_plan             ON payment_plan_installments (plan_id);

-- RLS: enable + tenant policies (inline JWT check — works without helper fns)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'academic_sections', 'fee_heads', 'term_fees', 'class_fees',
    'student_fee_adjustments', 'student_waivers', 'payments', 'receipts',
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
      EXECUTE format('CREATE POLICY tenant_select_%I ON %I FOR SELECT USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_insert_%I ON %I FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_update_%I ON %I FOR UPDATE USING (school_id::text = auth.jwt() ->> ''school_id'') WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_delete_%I ON %I FOR DELETE USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      RAISE NOTICE '032: tenant policies added to %', t;
    END IF;
  END LOOP;
END;
$$;
