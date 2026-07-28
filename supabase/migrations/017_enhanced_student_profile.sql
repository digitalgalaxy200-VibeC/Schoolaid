-- ============================================================================
-- SchoolAid — Migration 017: Enhanced Student Profile Fields
-- ============================================================================

-- Add first_name, middle_name, last_name to profiles (backward compatible)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Populate first/last from existing full_name where possible
UPDATE profiles SET
  first_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' 
    THEN split_part(full_name, ' ', 1)
    ELSE NULL
  END,
  last_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' 
    THEN reverse(split_part(reverse(full_name), ' ', 1))
    ELSE NULL
  END
WHERE first_name IS NULL;

-- Add personal info fields to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;

-- Add parent/guardian info
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_occupation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_location TEXT;

-- Emergency contact
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- Medical info
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS health_notes TEXT;

-- Enrollment status
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'graduated', 'withdrawn', 'suspended', 'alumni'));

-- Profile completion tracking
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_token TEXT;

-- Index for status
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
