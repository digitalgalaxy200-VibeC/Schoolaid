-- ============================================================================
-- 040 — Phase 3 (FIN-002): school-level currency (additive only)
-- The school stores a currency CODE (default NGN). Symbols and their position
-- (₦ before / FCFA after) are derived at render time by the finance module —
-- no amount is ever stored with a symbol.
-- ============================================================================

ALTER TABLE schools ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN';

COMMENT ON COLUMN schools.currency IS 'ISO-style currency code used across Finance (NGN, XOF, GHS, USD, …) — see lib/finance/currency.ts';
