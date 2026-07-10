-- ============================================================================
-- SchoolAid — Migration 008: Class-Teacher & Subject Assignment Enhancement
-- ============================================================================

-- 1. Class-Teacher Assignments (supports primary + assistant roles)
CREATE TABLE IF NOT EXISTS class_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('primary', 'assistant')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, class_id, teacher_id)
);

-- 2. Enhance teacher_subjects: role, is_active, and make teacher_id nullable (vacant)
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'assistant'));
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE teacher_subjects ALTER COLUMN teacher_id DROP NOT NULL;

-- 3. Add missing columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 4. Add missing columns to teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_role TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS gender TEXT;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_class_teachers_class ON class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_school ON class_teachers(school_id);

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS update_class_teachers_updated_at ON class_teachers;
CREATE TRIGGER update_class_teachers_updated_at
  BEFORE UPDATE ON class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Cascade: when a teacher is removed from a class, vacate their
--    subject assignments (set teacher_id = NULL). The school admin
--    reassigns them manually when ready.
CREATE OR REPLACE FUNCTION cleanup_subject_assignments_on_teacher_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE teacher_subjects
  SET teacher_id = NULL
  WHERE school_id = OLD.school_id
    AND class_id = OLD.class_id
    AND teacher_id = OLD.teacher_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_subjects_on_class_teacher_delete ON class_teachers;
CREATE TRIGGER trg_cleanup_subjects_on_class_teacher_delete
  AFTER DELETE ON class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_subject_assignments_on_teacher_removal();
