-- ============================================================================
-- 064 — Finance: canonical schema for an EXISTING database (production)
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY THIS FILE EXISTS
--   Migration 032 built the canonical Finance schema for staging, which was a
--   blank slate: it creates the finance tables from nothing. Production is not
--   a blank slate — it already carries a FIRST-GENERATION set of finance
--   tables, so several of 032's statements are `CREATE TABLE IF NOT EXISTS`
--   against names that already exist. On production those statements skip
--   silently and the database is left missing columns the application reads
--   (fee_heads.is_compulsory, payments.status, …). Running 032 on production
--   would therefore produce a schema that looks migrated and is not.
--
--   This file reaches the same end state as 032 for a database that already
--   has the first-generation tables. It is a no-op on staging.
--
-- WHAT IT DOES
--   PART A  compatibility layer  — academic_sections, classes.section_id,
--                                  students.*, schools.currency
--   PART B  canonical finance tables that are missing
--   PART C  reconciliation of the five finance tables that already exist
--   PART D  indexes
--   PART E  RLS policies (the tenant convention staging runs)
--   PART F  grants for the Supabase roles
--
-- PRECONDITION
--   Every first-generation finance table must be EMPTY. Part C adds NOT NULL
--   columns and tightens constraints, which is only safe against empty tables.
--   Verified 2026-09-30: fee_heads, student_fees, class_fee_overrides,
--   section_fee_defaults, fee_templates, fee_template_items, payments,
--   receipts, payment_plans and payment_plan_installments are all 0 rows on
--   production. The guard below refuses to run if that is no longer true.
--
-- DELIBERATELY NOT DONE
--   No DROP, TRUNCATE or DELETE of anything. The first-generation tables that
--   production has and staging does not (student_fees, class_fee_overrides,
--   section_fee_defaults, fee_templates, fee_template_items) are left exactly
--   as they are: nothing in the current application reads them, and removing
--   them is a separate, destructive decision.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PRECONDITION GUARD — refuse anything but an empty first-generation finance set
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t   TEXT;
  n   BIGINT;
  bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fee_heads', 'payments', 'receipts', 'payment_plans',
    'payment_plan_installments', 'student_fees', 'class_fee_overrides',
    'section_fee_defaults', 'fee_templates', 'fee_template_items'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN bad := bad || format('%s (%s rows)', t, n); END IF;
  END LOOP;

  IF array_length(bad, 1) > 0 THEN
    RAISE EXCEPTION
      '064 aborted: expected empty finance tables, found rows in: %', array_to_string(bad, ', ');
  END IF;
END $$;


-- ============================================================================
-- PART A — COMPATIBILITY LAYER
-- ============================================================================

-- A1. academic_sections — the per-term section model term_fees and
--     student_bills bind to.
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

-- A3. schools → currency (migration 040; harmless here, keeps this file complete)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN';

-- A4. students — finance display + filter fields.
--     This generation of the platform keeps the student's name in profiles, so
--     the name columns are backfilled from there (additive; existing values are
--     never overwritten).
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
CREATE INDEX IF NOT EXISTS idx_students_active ON students (is_active);

DO $$
BEGIN
  IF to_regclass('public.students') IS NULL OR to_regclass('public.profiles') IS NULL THEN RETURN; END IF;

  UPDATE students s
  SET first_name = COALESCE(NULLIF(s.first_name, ''), split_part(p.full_name, ' ', 1)),
      last_name  = COALESCE(NULLIF(s.last_name, ''),
                    CASE WHEN strpos(p.full_name, ' ') > 0
                         THEN substr(p.full_name, strpos(p.full_name, ' ') + 1)
                         ELSE '' END)
  FROM profiles p
  WHERE p.id = s.profile_id
    AND (s.first_name IS NULL OR s.last_name IS NULL);
END $$;


-- ============================================================================
-- PART B — CANONICAL FINANCE TABLES (created only where absent)
-- ============================================================================

-- B1. term_fees — required/optional fee definitions, term-scoped.
--     fee_type is the single source of truth for required vs optional.
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

-- B2. class_fees — per-class price override of a term fee.
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

-- B3. student_fee_adjustments — a student's opt-in to an optional fee.
--     Keyed to a class_fees row when the fee has one, otherwise to the term
--     fee directly (migration 039).
CREATE TABLE IF NOT EXISTS student_fee_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_fee_id UUID REFERENCES class_fees(id) ON DELETE CASCADE,
  term_fee_id  UUID REFERENCES term_fees(id) ON DELETE CASCADE,
  is_opted_in  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- B4. student_waivers — term-scoped discounts.
CREATE TABLE IF NOT EXISTS student_waivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id     UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  waiver_type TEXT NOT NULL DEFAULT 'fixed' CHECK (waiver_type IN ('fixed', 'percentage')),
  reason      TEXT,
  actor_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- B5. student_bills — one snapshot header per student per term.
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

-- B6. student_bill_lines — immutable snapshot lines.
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

-- B7. fee_allocations — payment → bill line allocation (partial payments).
CREATE TABLE IF NOT EXISTS fee_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_line_id        UUID NOT NULL REFERENCES student_bill_lines(id) ON DELETE CASCADE,
  amount              DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  converted_to_credit BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payment_id, bill_line_id)
);


-- ============================================================================
-- PART C — RECONCILE THE TABLES THAT ALREADY EXIST
--   These five exist in production in a first-generation shape. Nothing below
--   removes a column or a table.
-- ============================================================================

-- C1. fee_heads — the catalogue.
--     is_optional (nullable) is left in place for the retired screens that
--     still read it; is_compulsory is what the current application uses.
ALTER TABLE fee_heads ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE fee_heads ALTER COLUMN is_active  SET DEFAULT true;
ALTER TABLE fee_heads ALTER COLUMN is_active  SET NOT NULL;
ALTER TABLE fee_heads ALTER COLUMN display_order SET DEFAULT 0;
ALTER TABLE fee_heads ALTER COLUMN display_order SET NOT NULL;

-- Carry across any first-generation classification (no-op on an empty table,
-- and a no-op wherever is_optional was never set).
UPDATE fee_heads SET is_compulsory = NOT is_optional WHERE is_optional IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_heads_school_name ON fee_heads (school_id, name);

-- C2. payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method            TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference         TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number    TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'active';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by         UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at         TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS school_account_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_into         TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_name       TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_on           DATE;

UPDATE payments SET paid_at = payment_date::timestamptz
 WHERE payment_date IS NOT NULL AND paid_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_status_check
      CHECK (status IN ('active', 'voided', 'reversed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_receipt_number_key') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_receipt_number_key UNIQUE (receipt_number);
  END IF;
END $$;

-- C3. receipts
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS file_url               TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS expected_at_issue      NUMERIC;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_paid_at_issue    NUMERIC;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS balance_after          NUMERIC;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS previous_receipt_number TEXT;

-- The first-generation columns student_id / amount carry NOT NULL, and the
-- current application does not supply them when it issues a receipt. Leaving
-- them NOT NULL would make every receipt insert fail.
ALTER TABLE receipts ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN amount     DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN payment_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_school_id_receipt_number_key') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_school_id_receipt_number_key UNIQUE (school_id, receipt_number);
  END IF;
END $$;

-- C4. payment_plans (bill_id needs student_bills → declared in PART B)
ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS bill_id    UUID REFERENCES student_bills(id) ON DELETE SET NULL;
ALTER TABLE payment_plans ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE payment_plans ALTER COLUMN term_id DROP NOT NULL;
ALTER TABLE payment_plans ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE payment_plans ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_status_check') THEN
    ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_status_check
      CHECK (status IN ('active', 'completed', 'defaulted', 'cancelled'));
  END IF;
END $$;

-- C5. payment_plan_installments
ALTER TABLE payment_plan_installments ADD COLUMN IF NOT EXISTS school_id  UUID REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE payment_plan_installments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE payment_plan_installments i
   SET school_id = p.school_id
  FROM payment_plans p
 WHERE p.id = i.plan_id AND i.school_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_plan_installments WHERE school_id IS NULL) THEN
    ALTER TABLE payment_plan_installments ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE payment_plan_installments ALTER COLUMN is_paid SET DEFAULT false;
ALTER TABLE payment_plan_installments ALTER COLUMN is_paid SET NOT NULL;


-- ============================================================================
-- PART D — INDEXES
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


-- ============================================================================
-- PART E — RLS (the tenant convention staging runs: school_id = jwt.school_id)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'academic_sections', 'fee_heads', 'term_fees', 'class_fees',
    'student_fee_adjustments', 'student_waivers', 'payments', 'receipts',
    'student_bills', 'student_bill_lines', 'fee_allocations',
    'payment_plans', 'payment_plan_installments'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert_%I ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update_%I ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete_%I ON public.%I;', t, t);

    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_insert_%I ON public.%I FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_update_%I ON public.%I FOR UPDATE USING (school_id::text = auth.jwt() ->> ''school_id'') WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_delete_%I ON public.%I FOR DELETE USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
  END LOOP;
END $$;


-- ============================================================================
-- PART F — GRANTS (Supabase roles; the schema owner may already supply these)
-- ============================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'academic_sections', 'fee_heads', 'term_fees', 'class_fees',
    'student_fee_adjustments', 'student_waivers', 'payments', 'receipts',
    'student_bills', 'student_bill_lines', 'fee_allocations',
    'payment_plans', 'payment_plan_installments'
  ];
  r TEXT;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('GRANT ALL ON TABLE public.%I TO %I;', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- ============================================================================
-- VERIFY (run by hand after applying)
-- ============================================================================
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name = any(array['academic_sections','term_fees','class_fees',
--        'student_fee_adjustments','student_waivers','student_bills',
--        'student_bill_lines','fee_allocations'])
--    order by 1;                                    -- expect 8
--
--   select column_name from information_schema.columns
--    where table_name = 'fee_heads' and column_name = 'is_compulsory';  -- expect 1
--
--   select is_nullable from information_schema.columns
--    where table_name = 'receipts' and column_name in ('student_id','amount','payment_id');
--                                                  -- expect YES, YES, NO
