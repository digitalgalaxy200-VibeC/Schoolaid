-- ============================================================================
-- 038 — FIN-001 alignment: sender name + local payment date (additive only)
-- 1) payments.sender_name — who actually sent/deposited the money. This may
--    be a relative or agent, NOT necessarily the parent on the student file,
--    so it is captured free-text at recording time and never rewritten.
-- 2) payments.paid_on — the school-local (Africa/Lagos) calendar date the
--    payment belongs to. paid_at stays UTC (immutable instant); paid_on gives
--    deterministic "today's collection" grouping in the school's timezone.
-- ============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_on DATE;

COMMENT ON COLUMN payments.sender_name IS 'Person who actually made/deposited the payment (free text, may differ from the parent on file)';
COMMENT ON COLUMN payments.paid_on IS 'School-local calendar date (Africa/Lagos) the payment belongs to — derived once at recording time, never rewritten';

-- Backfill existing rows using the school-local date of their paid_at instant.
UPDATE payments
   SET paid_on = (paid_at AT TIME ZONE 'Africa/Lagos')::date
 WHERE paid_on IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_school_paid_on
  ON payments (school_id, paid_on DESC);
