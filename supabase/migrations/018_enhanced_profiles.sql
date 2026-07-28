-- ============================================================================
-- SchoolAid — Migration 018: Enhanced Student & Teacher Profile Fields
-- ============================================================================

-- ── STUDENTS ──────────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_occupation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_location TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS health_notes TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'graduated', 'withdrawn', 'suspended', 'alumni'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_token TEXT;
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- ── TEACHERS ──────────────────────────────────────────────────────────
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;

-- ── PROFILES ──────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill first_name / last_name from full_name where NULL
UPDATE profiles SET
  first_name = split_part(full_name, ' ', 1),
  last_name = reverse(split_part(reverse(full_name), ' ', 1))
WHERE first_name IS NULL AND full_name IS NOT NULL AND full_name != '';
