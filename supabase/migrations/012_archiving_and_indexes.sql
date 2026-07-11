-- ============================================================================
-- SchoolAid — Add archiving support (is_active on profiles already exists)
-- Add parent_phone to students, add phone to teachers (if not already in profiles)
-- ============================================================================

-- parent_phone may not exist on students yet
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;

-- Ensure profiles.is_active is available (already defined in 001 but guard)
ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT true;

-- Index for fast active/inactive filtering on students and teachers
CREATE INDEX IF NOT EXISTS idx_students_school_active ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
