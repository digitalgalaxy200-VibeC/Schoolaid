-- ============================================================================
-- SchoolAid — Phase 7 Prep: Student & Teacher Password Management
-- Adds must_change_password and generated_password to students and teachers.
-- ============================================================================

-- Students: add password columns for first-login onboarding flow
ALTER TABLE students ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Teachers: add password columns (same pattern as school_admins)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;
