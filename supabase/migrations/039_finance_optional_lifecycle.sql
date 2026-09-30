-- ============================================================================
-- 039 — Phase 1 (FIN-002): optional-fee lifecycle foundations (additive only)
-- Optional fees are a global catalogue; selection is strictly student-specific.
-- 1) A student opt-in may key to a TERM fee when the fee has no per-class
--    override row — previously an optional fee added for one student could be
--    silently dropped by the next sync/recalc because opt-ins required a
--    class_fees row that did not exist.
-- 2) Removal of a student's optional fee = zero the bill line + flip the
--    opt-in off (rows are never deleted; payments/allocation history survive).
-- No existing data or constraints are removed.
-- ============================================================================

-- Opt-in can now reference either a class fee (override) OR a term fee (default).
ALTER TABLE student_fee_adjustments ALTER COLUMN class_fee_id DROP NOT NULL;
ALTER TABLE student_fee_adjustments ADD COLUMN IF NOT EXISTS term_fee_id UUID REFERENCES term_fees(id) ON DELETE CASCADE;

-- One opt-in per student per key (dedupe at the DB level too)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sfa_student_class
  ON student_fee_adjustments (school_id, student_id, class_fee_id)
  WHERE class_fee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sfa_student_term
  ON student_fee_adjustments (school_id, student_id, term_fee_id)
  WHERE term_fee_id IS NOT NULL;

COMMENT ON COLUMN student_fee_adjustments.class_fee_id IS 'Optional fee opt-in keyed to the class override row (when the fee has one)';
COMMENT ON COLUMN student_fee_adjustments.term_fee_id IS 'Optional fee opt-in keyed to the term fee row (when the fee has NO class override)';
