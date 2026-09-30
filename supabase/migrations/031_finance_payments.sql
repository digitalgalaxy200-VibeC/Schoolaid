-- ============================================================================
-- SchoolAid — Migration 031: Finance Phase 5 — payments: term link + void audit
-- TARGET: the MIGRATED live schema (requires payments, receipts, academic_terms).
--
-- Additive only. Existing 47 payment rows are untouched (term_id stays NULL —
-- their term cannot be established reliably; they remain historical).
--   • payments.term_id    → direct term association for new payments
--   • payments.voided_by / voided_at → auditable reversal trail
--   • receipts UNIQUE (school_id, receipt_number) → per-school safety net
--     (payments' global UNIQUE(receipt_number) remains — new numbers are
--      generated with a school-specific prefix so both hold)
--
-- Idempotent. No DROP / TRUNCATE / DELETE / RENAME.
-- ============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_payments_term ON payments (term_id);

DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_receipt_number_school_key') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_receipt_number_school_key UNIQUE (school_id, receipt_number);
  END IF;
END;
$$;
