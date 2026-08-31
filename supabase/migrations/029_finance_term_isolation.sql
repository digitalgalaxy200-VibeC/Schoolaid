-- ============================================================================
-- SchoolAid — Migration 029: Finance Phase 2 — term isolation
-- TARGET: the MIGRATED live schema (requires term_fees, academic_terms).
--
-- WHY: term_fees currently has no session/term scoping, so a default created
--      for one term would silently apply to every term. Adding a nullable
--      term_id makes fee configuration term-aware:
--        • term_id set   → default applies to that term only
--        • term_id NULL  → legacy behavior (school-wide, all terms)
--      Class overrides (class_fees) inherit term scope through their
--      term_fee_id FK, so the whole chain becomes term-isolated.
--
-- ADDITIVE ONLY. Existing rows (21 term_fees) keep NULL (legacy semantics).
-- Idempotent. No DROP / TRUNCATE / DELETE / RENAME.
-- ============================================================================

ALTER TABLE term_fees ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_term_fees_term ON term_fees (term_id);
