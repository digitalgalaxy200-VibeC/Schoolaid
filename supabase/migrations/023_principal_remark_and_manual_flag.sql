-- ============================================================================
-- SchoolAid — Migration 023: Principal Remarks & Manual Override Flag
--
-- 1. Adds `principal_remark` column to grading_rows (the current active table)
-- 2. Adds `is_manual` flag to school_admin_comments so manual edits are never
--    overwritten by the automated remark engine
-- ============================================================================

-- 1. Add principal_remark to grading_rows (template-based grading system)
ALTER TABLE grading_rows ADD COLUMN IF NOT EXISTS principal_remark TEXT;

-- 2. Add is_manual flag to school_admin_comments
--    When TRUE the automated remark engine will not overwrite this comment.
ALTER TABLE school_admin_comments ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

-- 3. Grants
GRANT ALL ON grading_rows TO anon, authenticated, service_role;
GRANT ALL ON school_admin_comments TO anon, authenticated, service_role;
