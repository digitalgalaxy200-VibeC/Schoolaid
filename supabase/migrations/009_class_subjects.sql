-- ============================================================================
-- SchoolAid — Migration 009: Subject-to-Class Assignments
-- Allows a single subject (e.g. "English") to be assigned to many classes.
-- This is the prerequisite for the teacher→subject→class workflow.
-- ============================================================================

-- 1. class_subjects: which subjects a class is studying
CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- a subject can only be assigned to the same class once
  UNIQUE(school_id, class_id, subject_id)
);

-- 2. Indexes for fast look-up
CREATE INDEX IF NOT EXISTS idx_class_subjects_class   ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school  ON class_subjects(school_id);

-- 3. Auto-update updated_at
DROP TRIGGER IF EXISTS update_class_subjects_updated_at ON class_subjects;
CREATE TRIGGER update_class_subjects_updated_at
  BEFORE UPDATE ON class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_class_subjects ON class_subjects;
CREATE POLICY tenant_select_class_subjects ON class_subjects
  FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_class_subjects ON class_subjects;
CREATE POLICY tenant_insert_class_subjects ON class_subjects
  FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_class_subjects ON class_subjects;
CREATE POLICY tenant_update_class_subjects ON class_subjects
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_class_subjects ON class_subjects;
CREATE POLICY tenant_delete_class_subjects ON class_subjects
  FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- 5. Grant permissions
GRANT ALL ON class_subjects TO anon, authenticated, service_role;
