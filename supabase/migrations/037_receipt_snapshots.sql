-- ============================================================================
-- 037 — Phase B: receipt context snapshots (additive only)
-- A printed receipt must never change meaning later. These columns freeze the
-- term context at the moment of issuance; new fee changes, payments or voids
-- after issuance never rewrite what a receipt already shows.
-- ============================================================================

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS expected_at_issue       DECIMAL(12,2);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS total_paid_at_issue     DECIMAL(12,2);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS balance_after           DECIMAL(12,2);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS previous_receipt_number TEXT;

CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts (payment_id);
