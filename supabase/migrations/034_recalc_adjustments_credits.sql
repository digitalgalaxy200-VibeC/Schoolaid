-- ============================================================================
-- 034 — Phase 2: recalculation engine records (adjustments, credits, runs)
-- ADDITIVE ONLY. No existing table/data is altered or removed.
-- ============================================================================

-- Fee allocations may be flagged when their excess becomes student credit
-- during a recalculation. The original allocation row is never deleted.
ALTER TABLE fee_allocations ADD COLUMN IF NOT EXISTS converted_to_credit BOOLEAN NOT NULL DEFAULT false;

-- One executed recalculation run (preview → apply audit)
CREATE TABLE IF NOT EXISTS bill_recalc_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id),
  term_id          UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  initiated_by     UUID,
  reason           TEXT,
  students_affected INTEGER NOT NULL DEFAULT 0,
  bills_affected   INTEGER NOT NULL DEFAULT 0,
  totals_before    DECIMAL(14,2) NOT NULL DEFAULT 0,
  totals_after     DECIMAL(14,2) NOT NULL DEFAULT 0,
  credits_created  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Explicit financial adjustments caused by a fee change (or manual, later).
CREATE TABLE IF NOT EXISTS financial_adjustments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bill_id        UUID REFERENCES student_bills(id) ON DELETE CASCADE,
  bill_line_id   UUID REFERENCES student_bill_lines(id) ON DELETE SET NULL,
  term_id        UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
  fee_head_id    UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL DEFAULT 'fee_change', -- fee_change | manual
  before_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  after_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  reason         TEXT,
  actor_id       UUID,
  recalc_run_id  UUID REFERENCES bill_recalc_runs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Student credit ledger (money belonging to the student, not yet applied).
CREATE TABLE IF NOT EXISTS credits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id),
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id             UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  amount              DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reason              TEXT,
  source              TEXT NOT NULL DEFAULT 'fee_change', -- fee_change | fee_removed | overpayment
  source_payment_id   UUID REFERENCES payments(id) ON DELETE SET NULL,
  source_allocation_id UUID REFERENCES fee_allocations(id) ON DELETE SET NULL,
  source_fee_head_id  UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
  source_bill_id      UUID REFERENCES student_bills(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'open', -- open | closed
  created_by          UUID,
  recalc_run_id       UUID REFERENCES bill_recalc_runs(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Explicit credit applications (Phase 3 UI). Credit remaining = amount − Σ applications.
CREATE TABLE IF NOT EXISTS credit_applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  credit_id   UUID NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bill_id     UUID REFERENCES student_bills(id) ON DELETE CASCADE,
  term_id     UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
  amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  applied_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recalc_runs_school_term ON bill_recalc_runs (school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_fin_adj_school          ON financial_adjustments (school_id);
CREATE INDEX IF NOT EXISTS idx_fin_adj_student         ON financial_adjustments (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_credits_school          ON credits (school_id);
CREATE INDEX IF NOT EXISTS idx_credits_student         ON credits (student_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_app_school       ON credit_applications (school_id, credit_id);

-- RLS: same tenant-scoped protection as every other finance table
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['bill_recalc_runs', 'financial_adjustments', 'credits', 'credit_applications'];
  existing INTEGER;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('SELECT count(*) FROM pg_policies WHERE schemaname = ''public'' AND tablename = %L', t) INTO existing;
    IF existing = 0 THEN
      EXECUTE format('CREATE POLICY tenant_select_%I ON %I FOR SELECT USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_insert_%I ON %I FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_update_%I ON %I FOR UPDATE USING (school_id::text = auth.jwt() ->> ''school_id'') WITH CHECK (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      EXECUTE format('CREATE POLICY tenant_delete_%I ON %I FOR DELETE USING (school_id::text = auth.jwt() ->> ''school_id'');', t, t);
      RAISE NOTICE '034: tenant policies added to %', t;
    END IF;
  END LOOP;
END;
$$;
