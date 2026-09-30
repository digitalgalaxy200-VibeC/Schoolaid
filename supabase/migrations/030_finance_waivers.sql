-- ============================================================================
-- SchoolAid — Migration 030: Finance Phase 3 — waivers: fee-specific + percentage
-- TARGET: the MIGRATED live schema (requires student_waivers, fee_heads).
--
-- student_waivers currently supports bill-level fixed waivers only:
--   id, school_id, student_id, amount, reason, created_at, term_id
-- Additive extensions (existing waiver rows untouched):
--   • fee_head_id  → waive a specific charge (NULL = bill-level waiver)
--   • waiver_type  → 'fixed' | 'percentage' (the COMPUTED amount is always
--                    stored in `amount` — history stays exact)
--
-- Idempotent. No DROP / TRUNCATE / DELETE / RENAME.
-- ============================================================================

ALTER TABLE student_waivers ADD COLUMN IF NOT EXISTS fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL;
ALTER TABLE student_waivers ADD COLUMN IF NOT EXISTS waiver_type TEXT DEFAULT 'fixed' CHECK (waiver_type IN ('fixed', 'percentage'));
CREATE INDEX IF NOT EXISTS idx_student_waivers_fee_head ON student_waivers (fee_head_id);
