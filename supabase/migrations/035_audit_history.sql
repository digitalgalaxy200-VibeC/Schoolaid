-- ============================================================================
-- 035 — Phase 4: audit/history foundations (additive only)
-- ============================================================================

-- Who granted a waiver (previously missing actor attribution)
ALTER TABLE student_waivers ADD COLUMN IF NOT EXISTS actor_id UUID;

-- History lookups run frequently by student/term — supporting indexes
CREATE INDEX IF NOT EXISTS idx_waivers_student_term   ON student_waivers (school_id, student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_adj_student_bill       ON financial_adjustments (school_id, student_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_credits_student_created ON credits (school_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_app_student      ON credit_applications (school_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fee_events_created      ON fee_change_events (school_id, created_at);
