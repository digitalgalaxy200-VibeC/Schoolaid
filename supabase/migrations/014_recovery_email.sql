-- ============================================================================
-- SchoolAid — Add recovery_email to profiles
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recovery_email TEXT;
